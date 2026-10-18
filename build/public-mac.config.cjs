const signed=process.env.GMT_SIGNED_RELEASE==='1';
module.exports={
 extends:null,appId:'local.globalmarket.terminal',productName:'GLOBAL MARKET TERMINAL',
 directories:{output:process.env.GMT_MAC_OUTPUT||'../../release-v1.0.0-global-market-terminal/mac-candidate'},
 files:['desktop/dist/**/*','desktop/dist-electron/main.cjs','desktop/dist-electron/preload.cjs','desktop/dist-electron/notification-status.node','package.json','NOTICE','LICENSE','THIRD_PARTY_NOTICES/**/*'],
 extraResources:[{from:'backend/dist-public/imt-backend',to:'backend'}],
 extraMetadata:{sourceRevision:require('./source-revision.cjs')(),releaseChannel:'stable',updateReadiness:signed?'signed-candidate':'blocked-unsigned'},
 asar:true,asarUnpack:['desktop/dist-electron/*.node'],npmRebuild:false,
 publish:[{provider:'github',owner:'nirdesh-balar',repo:'GLOBAL-MARKET-TERMINAL',releaseType:'draft',private:false}],
 forceCodeSigning:signed,
 mac:{target:[{target:'dmg',arch:['arm64']},{target:'zip',arch:['arm64']}],icon:'desktop/assets/icon.icns',category:'public.app-category.finance',identity:signed?undefined:'-',hardenedRuntime:signed,notarize:signed,artifactName:'GLOBAL-MARKET-TERMINAL-${version}-mac-arm64.${ext}',extendInfo:{CFBundleDisplayName:'GLOBAL MARKET TERMINAL',CFBundleName:'GLOBAL MARKET TERMINAL'}},
 dmg:{artifactName:'GLOBAL-MARKET-TERMINAL-mac-arm64.dmg',title:'GLOBAL MARKET TERMINAL',sign:signed,window:{width:540,height:380},contents:[{x:140,y:190,type:'file'},{x:400,y:190,type:'link',path:'/Applications'}]},
 afterSign:'build/public-after-sign.cjs'
};
