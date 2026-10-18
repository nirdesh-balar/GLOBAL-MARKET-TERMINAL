import{resolve}from'node:path';
export const pythonExecutable=resolve(process.platform==='win32'?'backend/.venv/Scripts/python.exe':'backend/.venv/bin/python');
