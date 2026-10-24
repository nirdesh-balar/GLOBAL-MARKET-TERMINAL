import path from 'node:path';
export function backendExecutable(root:string,packaged:boolean,platform:string=process.platform){
  const pathModule = platform === 'win32' ? path.win32 : path.posix;
  if(platform==='win32'){
    return packaged?pathModule.join(root,'backend','imt-backend.exe'):pathModule.join(root,'backend','.venv','Scripts','python.exe');
  }
  return packaged?pathModule.join(root,'backend','imt-backend'):pathModule.join(root,'backend','.venv','bin','python');
}
export function containedProfile(candidate:string,root:string,pathModule:typeof path=path){
  const relative=pathModule.relative(root,candidate);
  return !!relative&&!pathModule.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+pathModule.sep);
}
export function leaseDirectory(resources:string){return path.resolve(resources,'../../..','.gmt-stage7-test-sessions');}
export function fullscreenAccelerator(platform:string=process.platform){return platform==='win32'?'F11':'Control+Command+F';}
export function isSupportedPlatform(platform:string=process.platform,arch:string=process.arch){
  return (platform==='darwin'&&arch==='arm64')||(platform==='win32'&&arch==='x64');
}
export function safeExportStem(name:string){return name.replace(/[^\p{L}\p{N} _-]/gu,'_').slice(0,64);}
