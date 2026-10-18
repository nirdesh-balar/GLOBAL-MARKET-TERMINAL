"""Only directory metadata, watchlists and preferences are written to disk."""
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

class Database:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self.connect() as c:
            legacy = c.execute("SELECT 1 FROM sqlite_master WHERE name='historical_candles'").fetchone()
            c.execute('PRAGMA secure_delete=ON')
            c.executescript('''
                DROP TABLE IF EXISTS candles;
                DROP TABLE IF EXISTS historical_candles;
                DROP TABLE IF EXISTS cache_metadata;
                DROP TABLE IF EXISTS provider_status;
                DROP TABLE IF EXISTS instruments;
                CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS watchlists(name TEXT PRIMARY KEY, items TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS securities(
                    token TEXT PRIMARY KEY, symbol TEXT UNIQUE NOT NULL, base_symbol TEXT NOT NULL,
                    name TEXT NOT NULL, company_name TEXT NOT NULL, isin TEXT NOT NULL,
                    series TEXT NOT NULL, board TEXT NOT NULL, yahoo_symbol TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS security_symbol ON securities(base_symbol);
            ''')
            if legacy:
                c.commit()
                c.execute('PRAGMA wal_checkpoint(TRUNCATE)')
                c.execute('VACUUM')
        path.chmod(0o600)

    @contextmanager
    def connect(self):
        c = sqlite3.connect(self.path, timeout=10)
        c.row_factory = sqlite3.Row
        try:
            with c: yield c
        finally: c.close()

    def get(self, key, default=None):
        with self.connect() as c:
            row = c.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()
        return json.loads(row['value']) if row else default

    def put(self, key, value):
        with self.connect() as c:
            c.execute('INSERT OR REPLACE INTO settings VALUES(?,?)', (key, json.dumps(value)))

    def search(self, query, limit=60):
        q = query.strip().upper()[:100]
        escaped = q.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        with self.connect() as c:
            rows = c.execute("""SELECT * FROM securities WHERE symbol LIKE ? ESCAPE '\\'
                OR company_name LIKE ? ESCAPE '\\' OR isin LIKE ? ESCAPE '\\'
                ORDER BY CASE WHEN base_symbol=? OR symbol=? THEN 0
                WHEN base_symbol LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END, symbol LIMIT ?""",
                (f'%{escaped}%', f'%{escaped}%', f'%{escaped}%', q, q, f'{escaped}%', limit)).fetchall()
        return [dict(r) for r in rows]

    def instrument(self, token):
        with self.connect() as c:
            row = c.execute('SELECT * FROM securities WHERE token=?', (token,)).fetchone()
        return dict(row) if row else None

    def resolve(self, symbol):
        with self.connect() as c:
            row = c.execute("SELECT * FROM securities WHERE symbol=? OR base_symbol=? ORDER BY CASE WHEN series='EQ' THEN 0 ELSE 1 END LIMIT 1", (symbol.upper(), symbol.upper())).fetchone()
        return dict(row) if row else None

    def count(self):
        with self.connect() as c:
            return c.execute('SELECT COUNT(*) FROM securities').fetchone()[0]

    def install(self, rows, metadata):
        with self.connect() as c:
            c.execute('DELETE FROM securities')
            c.executemany('INSERT INTO securities VALUES(:token,:symbol,:base_symbol,:name,:company_name,:isin,:series,:board,:yahoo_symbol)', rows)
            c.execute('INSERT OR REPLACE INTO settings VALUES(?,?)', ('catalogue', json.dumps(metadata)))
            c.execute('INSERT OR REPLACE INTO settings VALUES(?,?)', ('catalogue_error', 'null'))
