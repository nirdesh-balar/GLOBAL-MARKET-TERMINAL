import path from 'node:path';
export function backendExecutable(root:string,packaged:boolean){return packaged?path.join(root,'backend','imt-backend'):path.join(root,'backend','.venv','bin','python');}
export function containedProfile(candidate:string,root:string){const relative=path.relative(root,candidate);return !!relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);}
export function leaseDirectory(resources:string){return path.resolve(resources,'../../..','.gmt-stage7-test-sessions');}
export function fullscreenAccelerator(){return 'Control+Command+F';}
export function safeExportStem(name:string){return name.replace(/[^\p{L}\p{N} _-]/gu,'_').slice(0,64);}
