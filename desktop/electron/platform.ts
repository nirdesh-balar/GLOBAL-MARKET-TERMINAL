import path from 'node:path';
import {PRODUCT_NAME,STABLE_BUNDLE_ID,RELEASE_VERSION} from '../src/brand';
export function hostPaths(platform:NodeJS.Platform=process.platform){return platform==='win32'?path.win32:path.posix;}
export function backendExecutable(root:string,packaged:boolean,platform:NodeJS.Platform=process.platform){const p=hostPaths(platform);return packaged?p.join(root,'backend',platform==='win32'?'imt-backend.exe':'imt-backend'):p.join(root,'backend','.venv',platform==='win32'?'Scripts':'bin',platform==='win32'?'python.exe':'python');}
export function containedProfile(candidate:string,root:string,platform:NodeJS.Platform=process.platform){const p=hostPaths(platform),relative=p.relative(root,candidate);return !!relative&&!p.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+p.sep);}
export function leaseDirectory(resources:string,platform:NodeJS.Platform=process.platform){const p=hostPaths(platform);return p.resolve(resources,platform==='darwin'?'../../..':'../..','.gmt-stage7-test-sessions');}
export function fullscreenAccelerator(platform:NodeJS.Platform=process.platform){return platform==='darwin'?'Control+Command+F':'F11';}
export function stableWindowsIdentity(metadata:any,executable:string,arch:string){return metadata.version===RELEASE_VERSION&&metadata.releaseChannel==='stable'&&metadata.platformRelease==='windows-x64'&&metadata.stableAppId===STABLE_BUNDLE_ID&&!metadata.drawingPreview&&arch==='x64'&&path.win32.basename(executable)===PRODUCT_NAME+'.exe';}

export function safeExportStem(name:string,platform:NodeJS.Platform=process.platform){let value=name.replace(/[^\p{L}\p{N} _-]/gu,'_').slice(0,64);if(platform==='win32'){value=value.trim()||'Watchlist';if(/^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/i.test(value))value='_'+value;}return value;}
