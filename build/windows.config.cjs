const path=require('node:path');
module.exports={
 appId:'local.globalmarket.terminal',productName:'GLOBAL MARKET TERMINAL',extends:null,
 directories:{output:process.env.GMT_WINDOWS_OUTPUT||path.resolve('release-v1.0.0-global-market-terminal-windows/build')},
 files:['desktop/dist/**/*','desktop/dist-electron/main.cjs','desktop/dist-electron/preload.cjs','desktop/dist-electron/windows-integration.node','package.json','NOTICE','LICENSE','THIRD_PARTY_NOTICES/**/*'],
 extraResources:[{from:'backend/dist-windows/imt-backend',to:'backend'}],
 extraMetadata:{sourceRevision:require('./source-revision.cjs')(),releaseChannel:'stable',platformRelease:'windows-x64',stableAppId:'local.globalmarket.terminal',updateReadiness:process.env.GMT_SIGNED_RELEASE==='1'?'signed-candidate':'blocked-unsigned'},
 asar:true,asarUnpack:['desktop/dist-electron/windows-integration.node'],npmRebuild:false,forceCodeSigning:process.env.GMT_SIGNED_RELEASE==='1',publish:[{provider:'github',owner:'nirdesh-balar',repo:'GLOBAL-MARKET-TERMINAL',releaseType:'draft',private:false}],
 win:{verifyUpdateCodeSignature:true,target:[{target:'nsis',arch:['x64']},...(process.env.GMT_BUILD_PORTABLE==='1'?[{target:'portable',arch:['x64']}]:[])],icon:'desktop/assets/icon.ico',executableName:'GLOBAL MARKET TERMINAL',requestedExecutionLevel:'asInvoker',artifactName:'GLOBAL-MARKET-TERMINAL-win-x64-Setup.exe'},
 nsis:{oneClick:true,perMachine:false,runAfterFinish:false,deleteAppDataOnUninstall:false,createStartMenuShortcut:true,createDesktopShortcut:true,shortcutName:'GLOBAL MARKET TERMINAL',artifactName:'GLOBAL-MARKET-TERMINAL-win-x64-Setup.exe'},
 portable:{artifactName:'GLOBAL-MARKET-TERMINAL-win-x64-portable.exe',requestExecutionLevel:'user'}
};
