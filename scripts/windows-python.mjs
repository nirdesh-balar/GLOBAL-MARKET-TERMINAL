// Shared by setup, packaging and CI. Standard CPython; never free-threaded.
export const WINDOWS_PYTHON = '3.13.16';
export const WINDOWS_PYTHON_CHECK = `import sys,struct,json,sysconfig; assert sys.platform == 'win32' and sys.version_info[:3] == (${WINDOWS_PYTHON.split('.').join(',')}) and struct.calcsize('P') == 8 and not sysconfig.get_config_var('Py_GIL_DISABLED'); print(json.dumps({'version':sys.version,'executable':sys.executable,'architecture':'x64'}))`;
