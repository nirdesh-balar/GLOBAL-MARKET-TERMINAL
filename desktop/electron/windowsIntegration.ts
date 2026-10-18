import {join} from 'node:path';
export interface WindowsIntegration {attachBackend:(pid:number,executable:string)=>unknown;closeBackendJob:(job:unknown)=>void;notificationSetting:(appId:string)=>string;}
let instance:WindowsIntegration|undefined;
export function windowsIntegration():WindowsIntegration {
 if(process.platform!=='win32')throw Error('Windows integration is available only on Windows');
 return instance??=require(join(__dirname,'windows-integration.node')) as WindowsIntegration;
}
