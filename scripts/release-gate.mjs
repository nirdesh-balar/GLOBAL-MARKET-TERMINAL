import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';import{join,basename}from'node:path';
export const official='nirdesh-balar/GLOBAL-MARKET-TERMINAL';
export function validateAcceptance(a){
 const required=['sourceApproved','licenseApproved','macInstallerNative','windows11InstallerNative','macTrustedSigning','macNotarized','windowsAuthenticode','macNativeUpdateAtoB','windowsNativeUpdateAtoB','profilesProtected','finalPublicationApproved'];
 if(a.repository!==official||a.version!=='1.0.0'||a.tag!=='v1.0.0'||!/^[a-f0-9]{40}$/.test(a.sourceSha))throw Error('Release identity/source mismatch');
 for(const k of required)if(a[k]!==true)throw Error('Release gate incomplete: '+k);
 const names=new Set(a.assets.map(r=>r.name));for(const n of ['GLOBAL-MARKET-TERMINAL-mac-arm64.dmg','GLOBAL-MARKET-TERMINAL-win-x64-Setup.exe','latest-mac.yml','latest.yml'])if(!names.has(n))throw Error('Required release asset missing: '+n);
 for(const r of a.assets)if(!/^(GLOBAL-MARKET-TERMINAL-[A-Za-z0-9._-]+\.(dmg|exe|zip)(\.blockmap)?|latest(-mac)?\.yml|SHA256SUMS\.txt|RELEASE-NOTES\.md)$/.test(r.name)||basename(r.name)!==r.name||!/^[a-f0-9]{64}$/.test(r.sha256))throw Error('Invalid release asset');
 return true;
}
if(process.argv.includes('--check')){const file=process.argv[process.argv.indexOf('--check')+1];validateAcceptance(JSON.parse(await readFile(file,'utf8')));console.log('All declared release gates present; native evidence still requires human review.');}
if(process.argv.includes('--upload-draft')){
 const file=process.argv[process.argv.indexOf('--upload-draft')+1],a=JSON.parse(await readFile(file,'utf8'));validateAcceptance(a);
 const gh=args=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 if(gh(['api','user','--jq','.login']).trim()!=='nirdesh-balar')throw Error('Authenticated GitHub account must be nirdesh-balar');
 const repo=JSON.parse(gh(['api','repos/'+official]));if(repo.full_name!==official||repo.owner.login!=='nirdesh-balar'||!repo.permissions?.admin)throw Error('Official ownership/admin verification failed');
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();if(head!==a.sourceSha||execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Exact clean approved source required');
 const paths=[];for(const r of a.assets){const p=join(a.assetDirectory,r.name);if(createHash('sha256').update(await readFile(p)).digest('hex')!==r.sha256)throw Error('Asset fingerprint mismatch');paths.push(p);}
 // An existing tag/release is never overwritten. This creates a draft only.
 gh(['release','create',a.tag,...paths,'--repo',official,'--target',head,'--title','GLOBAL MARKET TERMINAL v1.0.0','--draft','--notes-file',a.notesFile]);
 console.log('Approved draft uploaded to the official repository; no stable publication performed.');
}
