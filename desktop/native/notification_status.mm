// Read/request UNUserNotificationCenter authorization inside the actual Electron bundle.
// N-API keeps this bridge independent of the Electron/V8 ABI. Delivery uses Electron Notification.
#import <Foundation/Foundation.h>
#import <UserNotifications/UserNotifications.h>
#include <node_api.h>
#include <memory>
#include <string>
struct Result { std::string authorization="unknown", alerts="unknown", sounds="unknown", center="unknown", error=""; };
struct Work { napi_async_work work; napi_deferred deferred; bool request; std::shared_ptr<Result> value=std::make_shared<Result>(); };
static std::string setting(UNNotificationSetting s) {return s==UNNotificationSettingEnabled?"enabled":s==UNNotificationSettingDisabled?"disabled":"unsupported";}
static void Execute(napi_env,void* input) {
 @autoreleasepool {
  Work* w=(Work*)input;auto result=std::make_shared<Result>();
  @try {
   UNUserNotificationCenter* center=[UNUserNotificationCenter currentNotificationCenter];
   if(w->request) {
    dispatch_semaphore_t permission=dispatch_semaphore_create(0);
    [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert|UNAuthorizationOptionSound|UNAuthorizationOptionBadge) completionHandler:^(BOOL granted,NSError* error){dispatch_semaphore_signal(permission);}];
    if(dispatch_semaphore_wait(permission,dispatch_time(DISPATCH_TIME_NOW,60*NSEC_PER_SEC))!=0){w->value->error="Permission request is awaiting a macOS response. Check status again.";return;}
   }
   dispatch_semaphore_t done=dispatch_semaphore_create(0);
   [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings* s){
    switch(s.authorizationStatus){case UNAuthorizationStatusNotDetermined:result->authorization="not_determined";break;case UNAuthorizationStatusDenied:result->authorization="denied";break;case UNAuthorizationStatusAuthorized:result->authorization="authorized";break;case UNAuthorizationStatusProvisional:result->authorization="provisional";break;default:result->authorization="unknown";break;}
    result->alerts=setting(s.alertSetting);result->sounds=setting(s.soundSetting);result->center=setting(s.notificationCenterSetting);dispatch_semaphore_signal(done);
   }];
   if(dispatch_semaphore_wait(done,dispatch_time(DISPATCH_TIME_NOW,5*NSEC_PER_SEC))!=0)w->value->error="macOS notification settings did not respond.";else w->value=result;
  } @catch(NSException* e) {w->value->error="macOS notification authorization status is unavailable for this app bundle.";}
 }
}
static void Complete(napi_env env,napi_status status,void* input){
 Work* w=(Work*)input;napi_value object;napi_create_object(env,&object);
 auto put=[&](const char* key,const std::string& s){napi_value v;napi_create_string_utf8(env,s.c_str(),s.size(),&v);napi_set_named_property(env,object,key,v);};
 put("authorization",w->value->authorization);put("alerts",w->value->alerts);put("sounds",w->value->sounds);put("notification_center",w->value->center);put("error",w->value->error);
 napi_resolve_deferred(env,w->deferred,object);napi_delete_async_work(env,w->work);delete w;
}
static napi_value Status(napi_env env,napi_callback_info info){
 size_t argc=1;napi_value argv[1];napi_get_cb_info(env,info,&argc,argv,nullptr,nullptr);bool request=false;if(argc)napi_get_value_bool(env,argv[0],&request);
 Work* w=new Work();w->request=request;napi_value promise,name;napi_create_promise(env,&w->deferred,&promise);napi_create_string_utf8(env,"notificationStatus",NAPI_AUTO_LENGTH,&name);napi_create_async_work(env,nullptr,name,Execute,Complete,w,&w->work);napi_queue_async_work(env,w->work);return promise;
}
static napi_value Init(napi_env env,napi_value exports){napi_value f;napi_create_function(env,"status",NAPI_AUTO_LENGTH,Status,nullptr,&f);napi_set_named_property(env,exports,"status",f);return exports;}
NAPI_MODULE(NODE_GYP_MODULE_NAME,Init)
