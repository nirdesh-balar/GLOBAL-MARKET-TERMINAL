"""First-run Stage 3 metadata seed; the source preview is opened read-only."""
import os
import sqlite3
from pathlib import Path

def seed_preview(source:Path,destination:Path)->bool:
    if destination.exists() or not source.is_file():return False
    destination.parent.mkdir(parents=True,exist_ok=True)
    temporary=destination.with_name(destination.name+'.seed-tmp')
    try:
        origin=sqlite3.connect(source.resolve().as_uri()+'?mode=ro',uri=True)
        target=sqlite3.connect(temporary)
        try:origin.backup(target)
        finally:target.close();origin.close()
        # Never replace a profile created while the read-only seed was in progress.
        try:os.link(temporary,destination)
        except FileExistsError:return False
        return True
    finally:
        temporary.unlink(missing_ok=True)
