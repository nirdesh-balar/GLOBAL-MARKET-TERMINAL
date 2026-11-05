"""Only directory metadata, watchlists and preferences are written to disk."""
import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

VALID_FLAG_COLORS = frozenset({'red', 'blue', 'green', 'yellow', 'purple', 'cyan', 'pink'})

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
                CREATE TABLE IF NOT EXISTS symbol_color_flags(
                    canonical_id TEXT PRIMARY KEY,
                    color TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    name TEXT NOT NULL,
                    exchange TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    metadata TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL);
                CREATE INDEX IF NOT EXISTS idx_flags_color ON symbol_color_flags(color);
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

    def get_flags(self, conn=None):
        if conn is not None:
            rows = conn.execute("SELECT * FROM symbol_color_flags ORDER BY created_at ASC").fetchall()
        else:
            with self.connect() as c:
                rows = c.execute("SELECT * FROM symbol_color_flags ORDER BY created_at ASC").fetchall()
        result = {}
        for r in rows:
            d = dict(r)
            try:
                d['metadata'] = json.loads(d['metadata']) if isinstance(d['metadata'], str) else (d['metadata'] or {})
            except Exception:
                d['metadata'] = {}
            result[d['canonical_id']] = d
        return result

    def get_flags_by_color(self, color: str, conn=None):
        col = color.lower().strip()
        if conn is not None:
            rows = conn.execute("SELECT * FROM symbol_color_flags WHERE color=? ORDER BY created_at ASC", (col,)).fetchall()
        else:
            with self.connect() as c:
                rows = c.execute("SELECT * FROM symbol_color_flags WHERE color=? ORDER BY created_at ASC", (col,)).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            try:
                d['metadata'] = json.loads(d['metadata']) if isinstance(d['metadata'], str) else (d['metadata'] or {})
            except Exception:
                d['metadata'] = {}
            result.append(d)
        return result

    def set_flag(self, canonical_id: str, color: str, symbol: str, name: str, exchange: str, provider: str, kind: str, metadata: dict | None = None, conn=None):
        col = color.lower().strip()
        if col not in VALID_FLAG_COLORS:
            raise ValueError(f"Invalid flag color: {color}. Must be one of {sorted(VALID_FLAG_COLORS)}")
        cid = (canonical_id or '').strip()
        sym = (symbol or '').strip()
        if not cid or not sym:
            raise ValueError("canonical_id and symbol are required")
        now = time.time()
        meta = metadata or {}
        meta_json = json.dumps(meta)
        sql = """
            INSERT INTO symbol_color_flags(canonical_id, color, symbol, name, exchange, provider, kind, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(canonical_id) DO UPDATE SET
                color=excluded.color,
                symbol=excluded.symbol,
                name=excluded.name,
                exchange=excluded.exchange,
                provider=excluded.provider,
                kind=excluded.kind,
                metadata=excluded.metadata,
                updated_at=excluded.updated_at
        """
        params = (cid, col, sym, (name or sym).strip(), (exchange or '').strip(), (provider or 'yahoo').strip(), (kind or 'equity').strip(), meta_json, now, now)
        if conn is not None:
            conn.execute(sql, params)
        else:
            with self.connect() as c:
                c.execute(sql, params)
        return {
            "canonical_id": cid,
            "color": col,
            "symbol": sym,
            "name": name or sym,
            "exchange": exchange,
            "provider": provider or 'yahoo',
            "kind": kind or 'equity',
            "metadata": meta,
            "updated_at": now
        }

    def remove_flag(self, canonical_id: str):
        cid = (canonical_id or '').strip()
        if not cid:
            return False
        with self.connect() as c:
            res = c.execute("DELETE FROM symbol_color_flags WHERE canonical_id=?", (cid,))
            return res.rowcount > 0

    def clear_color_flags(self, color: str):
        col = color.lower().strip()
        if col not in VALID_FLAG_COLORS:
            raise ValueError(f"Invalid flag color: {color}")
        with self.connect() as c:
            res = c.execute("DELETE FROM symbol_color_flags WHERE color=?", (col,))
            return res.rowcount

    def get_color_aliases(self):
        aliases = self.get('flag_color_aliases') or {}
        if not isinstance(aliases, dict):
            return {}
        return {k: v for k, v in aliases.items() if k in VALID_FLAG_COLORS and isinstance(v, str)}

    def set_color_alias(self, color: str, alias: str):
        col = color.lower().strip()
        if col not in VALID_FLAG_COLORS:
            raise ValueError(f"Invalid flag color: {color}")
        trimmed = alias.strip()[:64]
        if any(ord(c) < 32 for c in trimmed):
            raise ValueError("Invalid alias characters")
        aliases = self.get_color_aliases()
        if trimmed:
            aliases[col] = trimmed
        else:
            aliases.pop(col, None)
        self.put('flag_color_aliases', aliases)
        return aliases
