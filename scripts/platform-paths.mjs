import {resolve} from 'node:path';

export const pythonExecutable = resolve(
  process.platform === 'win32'
    ? 'backend/.venv/Scripts/python.exe'
    : 'backend/.venv/bin/python'
);

export function getPythonExecutable(root = '.', platform = process.platform) {
  return resolve(
    root,
    platform === 'win32'
      ? 'backend/.venv/Scripts/python.exe'
      : 'backend/.venv/bin/python'
  );
}

export function getBackendExecutable(root = '.', packaged = false, platform = process.platform) {
  if (packaged) {
    return resolve(root, 'backend', platform === 'win32' ? 'imt-backend.exe' : 'imt-backend');
  }
  return getPythonExecutable(root, platform);
}
