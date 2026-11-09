import os
import sys
import json
import sqlite3
from pathlib import Path

default_target = (
    Path(__file__).resolve().parent.parent
    / "release-candidate-rc6"
    / "portable"
    / "GLOBAL-MARKET-TERMINAL-1.1.0-rc.6-win-x64-portable"
    / "GMT-Portable-Data"
    / "profile"
)
target_dir = Path(os.environ.get("GMT_PORTABLE_PROFILE_DIR", default_target))
target_dir.mkdir(parents=True, exist_ok=True)
target_db = target_dir / 'terminal.sqlite3'

assert target_db.exists(), f"Target DB {target_db} must exist from previous acceptance run"

conn = sqlite3.connect(target_db)
c = conn.cursor()
row = c.execute("SELECT value FROM settings WHERE key='workspace'").fetchone()
if row:
    ws = json.loads(row[0])
    ws.setdefault('sidebar', {})
    ws['sidebar']['visible'] = True

    # Configure active chart pane with Volume ON and dark theme
    ws['theme'] = 'dark'
    if 'panes' in ws and len(ws['panes']) > 0:
        pane0 = ws['panes'][0]
        pane0['volume'] = True
        pane0['indicators_hidden'] = False
        print(f"Pane 0 symbol: {pane0.get('symbol')}, volume: {pane0.get('volume')}")

    c.execute("UPDATE settings SET value=? WHERE key='workspace'", (json.dumps(ws),))
    conn.commit()
    print("Successfully seeded interactive portable profile at:", target_db)
    print("  Theme: dark")
    print("  Sidebar Visible: True")
    print("  Volume Enabled: True")
    print("  Panes Count:", len(ws.get('panes', [])))
else:
    print("ERROR: No workspace found in database settings.")
    sys.exit(1)

conn.close()
