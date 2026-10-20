"""Private macOS profile directory: POSIX owner-only access."""
from pathlib import Path


def secure_profile(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
