const{execFileSync}=require('node:child_process');
module.exports=()=>{
 try{
  const run=args=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const remote=run(['remote','get-url','origin']);
  if(!['https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL.git','git@github.com:nirdesh-balar/GLOBAL-MARKET-TERMINAL.git'].includes(remote))throw Error('Unofficial project origin');
  const sha=run(['rev-parse','HEAD']);if(!/^[a-f0-9]{40}$/.test(sha)||run(['status','--porcelain']))throw Error('Exact clean source required');return sha;
 }catch(error){if(process.env.GMT_SIGNED_RELEASE==='1')throw Error('Signed releases require the exact clean official-origin source revision');return null;}
};
