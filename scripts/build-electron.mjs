import { build } from 'esbuild';
await build({ entryPoints: ['desktop/electron/main.ts', 'desktop/electron/preload.ts'], outdir: 'desktop/dist-electron', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', target: 'node22', external: ['electron', 'ws', 'electron-updater', 'js-yaml'] });
