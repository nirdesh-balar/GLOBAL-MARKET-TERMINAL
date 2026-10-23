const isWin = typeof navigator !== 'undefined' && (/win/i.test(navigator.userAgent || '') || /win/i.test(navigator.platform || ''));
export const OS_NAME = isWin ? 'Windows' : 'macOS';
export const PRIMARY_KEY = isWin ? 'Ctrl+' : '⌘';
export const FULLSCREEN_HINT = isWin ? 'F11' : '⌃⌘F';
export const UNDO_HINT = isWin ? 'Ctrl+Z' : '⌘Z';
export const REDO_HINT = isWin ? 'Ctrl+Y' : '⇧⌘Z';
