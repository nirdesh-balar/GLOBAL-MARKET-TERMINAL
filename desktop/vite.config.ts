import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({ root: fileURLToPath(new URL('.', import.meta.url)), base: './', plugins: [react(), tailwindcss(), {name:'dev-refresh-csp',apply:'serve',transformIndexHtml(html){return html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';");}}], server: { host: '127.0.0.1', port: 5173, strictPort: true }, build: { outDir: 'dist', emptyOutDir: true } });
