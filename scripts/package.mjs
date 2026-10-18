// Historical preview packaging belongs to its preserved source archive.
if(process.argv.slice(2).some(a=>a.startsWith('--stage')))throw Error('Use the archived preview source; public packaging never overwrites older releases');
await import('./package-public-mac.mjs');
