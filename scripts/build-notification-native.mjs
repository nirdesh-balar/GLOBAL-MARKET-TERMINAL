if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('Native Apple Silicon macOS is required');
import {existsSync,mkdirSync} from 'node:fs';import {dirname,resolve} from 'node:path';import {spawnSync} from 'node:child_process';
if(process.platform==='darwin'){
 const candidates=[resolve(dirname(process.execPath),'../include/node'),'/usr/local/include/node','/opt/homebrew/include/node'];const headers=candidates.find(p=>existsSync(p+'/node_api.h'));if(!headers)throw Error('Node N-API headers are required to build the macOS notification permission bridge.');
 mkdirSync('desktop/dist-electron',{recursive:true});const p=spawnSync('/usr/bin/clang++',['-std=c++17','-fobjc-arc','-bundle','-undefined','dynamic_lookup','-I'+headers,'-framework','Foundation','-framework','UserNotifications','desktop/native/notification_status.mm','-o','desktop/dist-electron/notification-status.node'],{stdio:'inherit'});if(p.status!==0)process.exit(p.status||1);
}
