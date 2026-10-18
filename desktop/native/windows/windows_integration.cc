#include <node_api.h>
#include <windows.h>
#include <roapi.h>
#include <tlhelp32.h>
#include <winrt/Windows.UI.Notifications.h>
#include <string>

struct OwnedJob { HANDLE handle; };
static void Close(OwnedJob* job) { if(job && job->handle) { CloseHandle(job->handle); job->handle=nullptr; } }
static void Finalize(napi_env,void* p,void*) { auto* job=static_cast<OwnedJob*>(p); Close(job); delete job; }
static napi_value Fail(napi_env env,const char* message) { napi_throw_error(env,nullptr,message); return nullptr; }
static napi_value Attach(napi_env env,napi_callback_info info) {
 size_t argc=2; napi_value argv[2]; napi_get_cb_info(env,info,&argc,argv,nullptr,nullptr); uint32_t pid=0;
 if(argc!=2 || napi_get_value_uint32(env,argv[0],&pid)!=napi_ok || !pid || pid==GetCurrentProcessId())return Fail(env,"Invalid owned backend PID");
 HANDLE process=OpenProcess(PROCESS_SET_QUOTA|PROCESS_TERMINATE|PROCESS_QUERY_LIMITED_INFORMATION,FALSE,pid);
 if(!process)return Fail(env,"Cannot open the owned backend process");
 // Verify the opened process image and direct parent before granting job ownership.
 size_t length=0;if(napi_get_value_string_utf16(env,argv[1],nullptr,0,&length)!=napi_ok||!length||length>32767){CloseHandle(process);return Fail(env,"Invalid owned backend image");}
 std::u16string expected(length+1,u'\0');napi_get_value_string_utf16(env,argv[1],expected.data(),expected.size(),&length);expected.resize(length);
 wchar_t image[32768];DWORD count=32768;bool owned=false;HANDLE snapshot=CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0);
 if(snapshot!=INVALID_HANDLE_VALUE){PROCESSENTRY32W entry{};entry.dwSize=sizeof(entry);if(Process32FirstW(snapshot,&entry))do{if(entry.th32ProcessID==pid){owned=entry.th32ParentProcessID==GetCurrentProcessId();break;}}while(Process32NextW(snapshot,&entry));CloseHandle(snapshot);}
 wchar_t expectedLong[32768],imageLong[32768];DWORD expectedCount=GetLongPathNameW(reinterpret_cast<const wchar_t*>(expected.c_str()),expectedLong,32768);bool imageRead=QueryFullProcessImageNameW(process,0,image,&count)!=FALSE;DWORD imageCount=imageRead?GetLongPathNameW(image,imageLong,32768):0;
 if(!owned||!expectedCount||expectedCount>=32768||!imageCount||imageCount>=32768||CompareStringOrdinal(imageLong,imageCount,expectedLong,expectedCount,TRUE)!=CSTR_EQUAL){CloseHandle(process);return Fail(env,"Backend process ownership/image mismatch");}
 HANDLE handle=CreateJobObjectW(nullptr,nullptr); JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{}; limits.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
 if(!handle || !SetInformationJobObject(handle,JobObjectExtendedLimitInformation,&limits,sizeof(limits)) || !AssignProcessToJobObject(handle,process)) {
  CloseHandle(process); if(handle)CloseHandle(handle);return Fail(env,"Cannot assign the owned backend to its cleanup job");
 }
 CloseHandle(process); auto* job=new OwnedJob{handle}; napi_value result;
 if(napi_create_external(env,job,Finalize,nullptr,&result)!=napi_ok){Close(job);delete job;return Fail(env,"Cannot retain the owned backend job");}
 return result;
}
static napi_value CloseJob(napi_env env,napi_callback_info info) {
 size_t argc=1;napi_value argv[1];napi_get_cb_info(env,info,&argc,argv,nullptr,nullptr);void* value=nullptr;
 if(argc!=1||napi_get_value_external(env,argv[0],&value)!=napi_ok)return Fail(env,"Invalid owned backend job");
 Close(static_cast<OwnedJob*>(value));napi_value result;napi_get_undefined(env,&result);return result;
}
static napi_value Setting(napi_env env,napi_callback_info info) {
 size_t argc=1;napi_value argv[1];napi_get_cb_info(env,info,&argc,argv,nullptr,nullptr);size_t length=0;
 if(argc!=1||napi_get_value_string_utf16(env,argv[0],nullptr,0,&length)!=napi_ok||!length||length>180)return Fail(env,"Invalid notification application identity");
 std::u16string id(length+1,u'\0');napi_get_value_string_utf16(env,argv[0],id.data(),id.size(),&length);id.resize(length);
 const HRESULT initialized=RoInitialize(RO_INIT_MULTITHREADED);const char* result="unknown";
 try {
  using namespace winrt::Windows::UI::Notifications;
  auto setting=ToastNotificationManager::CreateToastNotifier(winrt::hstring(reinterpret_cast<const wchar_t*>(id.c_str()),static_cast<uint32_t>(length))).Setting();
  switch(setting){case NotificationSetting::Enabled:result="enabled";break;case NotificationSetting::DisabledForApplication:result="disabled_for_application";break;case NotificationSetting::DisabledForUser:result="disabled_for_user";break;case NotificationSetting::DisabledByGroupPolicy:result="disabled_by_policy";break;case NotificationSetting::DisabledByManifest:result="disabled_by_manifest";break;default:break;}
 }catch(...){/* Keep status unknown; never infer permission from API support alone. */}
 if(SUCCEEDED(initialized))RoUninitialize();napi_value output;napi_create_string_utf8(env,result,NAPI_AUTO_LENGTH,&output);return output;
}
NAPI_MODULE_INIT(){napi_property_descriptor properties[]={{"attachBackend",nullptr,Attach,nullptr,nullptr,nullptr,napi_default_method,nullptr},{"closeBackendJob",nullptr,CloseJob,nullptr,nullptr,nullptr,napi_default_method,nullptr},{"notificationSetting",nullptr,Setting,nullptr,nullptr,nullptr,napi_default_method,nullptr}};napi_define_properties(env,exports,3,properties);return exports;}
