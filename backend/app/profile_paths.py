"""macOS default; Electron supplies its already-validated userData explicitly."""
from pathlib import Path


def default_profile(home=None):
    home = Path.home() if home is None else Path(home)
    return home / 'Library' / 'Application Support' / 'GLOBAL MARKET TERMINAL'
