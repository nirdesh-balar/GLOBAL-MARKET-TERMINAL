import {app} from 'electron';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {ApplicationUpdates,UPDATE_OWNER,UPDATE_REPO,type UpdateEngine,type UpdateState} from './updates';

export function startUpdates(metadata:any,emit:(s:UpdateState)=>void){
 let engine:UpdateEngine|null=null,reason='Automatic updates are not ready in this development candidate. Install a verified signed release manually.';
 if(app.isPackaged&&metadata.releaseChannel==='stable'&&metadata.updateReadiness==='signed-candidate'){
  try{
   const config=require('js-yaml').load(readFileSync(join(process.resourcesPath,'app-update.yml'),'utf8'));
   if(config.provider!=='github'||config.owner!==UPDATE_OWNER||config.repo!==UPDATE_REPO||config.private===true)throw Error('Unofficial update feed');
   if(process.platform==='darwin'){
    execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app.getAppPath().replace(/\/Contents\/Resources\/app.asar$/,'')],{stdio:'pipe'});
    const r=require('node:child_process').spawnSync('/usr/bin/codesign',['-dv','--verbose=4',app.getAppPath().replace(/\/Contents\/Resources\/app.asar$/,'')],{encoding:'utf8'});
    if(!/Authority=Developer ID Application:/.test(r.stderr)||!/TeamIdentifier=[A-Z0-9]{10}\b/.test(r.stderr))throw Error('Developer ID required');
   }else throw Error('Unsupported updater platform');
   engine=require('electron-updater').autoUpdater;
  }catch{reason='Automatic updates are blocked: official feed and trusted native signing must be verified.';}
 }
 const service=new ApplicationUpdates(engine,app.getPath('userData'),reason,emit);service.start();return service;
}
