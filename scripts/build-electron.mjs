import { build } from 'esbuild';
import sourceRevision from '../build/source-revision.cjs';
await build({ entryPoints: ['desktop/electron/main.ts', 'desktop/electron/preload.ts'], outdir: 'desktop/dist-electron', outExtension: { '.js': '.cjs' }, bundle: true, define: { GMT_BUILD_REVISION: JSON.stringify(sourceRevision()) }, platform: 'node', target: 'node22', external: ['electron', 'ws', 'electron-updater', 'js-yaml'] });
