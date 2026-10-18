"""Platform defaults only; Electron supplies its already-validated userData explicitly."""
import os
import sys
from pathlib import Path


def default_profile(platform=None, environ=None, home=None):
    platform = sys.platform if platform is None else platform
    environ = os.environ if environ is None else environ
    home = Path.home() if home is None else Path(home)
    if platform == 'win32':
        return Path(environ.get('APPDATA') or home / 'AppData' / 'Roaming') / 'GLOBAL MARKET TERMINAL'
    return home / 'Library' / 'Application Support' / 'GLOBAL MARKET TERMINAL'
