const{execFileSync}=require('node:child_process');const{join}=require('node:path');
module.exports=async context=>{
 if(process.platform!=='darwin')return;
 const app=join(context.appOutDir,'GLOBAL MARKET TERMINAL.app');
 if(process.env.GMT_SIGNED_RELEASE!=='1')execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-',app],{stdio:'inherit'});
 execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});
};
