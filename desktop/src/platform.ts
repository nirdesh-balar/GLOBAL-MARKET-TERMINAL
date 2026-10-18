export const WINDOWS=typeof window!=='undefined'&&window.terminal?.platform==='win32';
export const OS_NAME=WINDOWS?'Windows':'macOS';
export const PRIMARY_KEY=WINDOWS?'Ctrl':'⌘';
export const FULLSCREEN_HINT=WINDOWS?'F11':'⌃⌘F';
export const UNDO_HINT=WINDOWS?'Ctrl+Z':'⌘Z';
export const REDO_HINT=WINDOWS?'Ctrl+Shift+Z':'⇧⌘Z';
