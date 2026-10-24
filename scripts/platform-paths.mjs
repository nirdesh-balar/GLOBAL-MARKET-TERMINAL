import path, {resolve} from 'node:path';

export const pythonExecutable = resolve(
  process.platform === 'win32'
    ? 'backend/.venv/Scripts/python.exe'
    : 'backend/.venv/bin/python'
);

export function getPythonExecutable(root = '.', platform = process.platform) {
  const pathModule = platform === 'win32' ? path.win32 : path.posix;
  return pathModule.resolve(
    root,
    platform === 'win32'
      ? 'backend/.venv/Scripts/python.exe'
      : 'backend/.venv/bin/python'
  );
}

export function getBackendExecutable(root = '.', packaged = false, platform = process.platform) {
  const pathModule = platform === 'win32' ? path.win32 : path.posix;
  if (packaged) {
    return pathModule.resolve(root, 'backend', platform === 'win32' ? 'imt-backend.exe' : 'imt-backend');
  }
  return getPythonExecutable(root, platform);
}
