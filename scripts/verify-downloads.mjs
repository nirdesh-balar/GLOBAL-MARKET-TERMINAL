import{createHash}from'node:crypto';import{readFile,writeFile,mkdir}from'node:fs/promises';
const base='https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/releases/latest/download/';
const arg=process.argv.find(a=>a.startsWith('--approved-manifest='));if(!arg)throw Error('Provide the exact approved artifact manifest; prospective URLs are not proof');
const manifest=JSON.parse(await readFile(arg.split('=').slice(1).join('='),'utf8')),rows=[];
for(const name of ['GLOBAL-MARKET-TERMINAL-mac-arm64.dmg','GLOBAL-MARKET-TERMINAL-win-x64-Setup.exe']){
 const expected=manifest.assets.find(a=>a.name===name)?.sha256;if(!/^[a-f0-9]{64}$/.test(expected||''))throw Error('Approved hash missing');
 const url=base+name,r=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error('Public asset unavailable: '+r.status+' '+name);
 const h=createHash('sha256');let bytes=0;for await(const chunk of r.body){bytes+=chunk.length;if(bytes>750*1024**2)throw Error('Public asset size budget exceeded');h.update(chunk);}const actual=h.digest('hex');if(actual!==expected)throw Error('Public download hash mismatch: '+name);rows.push({name,url,bytes,sha256:actual,actual_download_verified:true});
}
await mkdir('test-results',{recursive:true});await writeFile('test-results/public-downloads.json',JSON.stringify(rows,null,2));
if(process.argv.includes('--update-readme')){
 const p='README.md',text=await readFile(p,'utf8'),a=text.indexOf('## Download'),b=text.indexOf('## Features',a);if(a<0||b<0)throw Error('README section not found');
 await writeFile(p,text.slice(0,a)+'## Download\n\n[DOWNLOAD FOR MACOS — Apple Silicon]('+rows[0].url+')\n\n[DOWNLOAD FOR WINDOWS — x64]('+rows[1].url+')\n\n[Latest release](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/releases/latest)\n\n'+text.slice(b));
}
console.log('Both actual public installer downloads matched the approved SHA-256 values.');
