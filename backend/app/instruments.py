"""Full official NSE directories. No index membership filter or broker catalogue."""
import asyncio
import csv
import hashlib
import io
import os
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

SOURCES = {
    'MAINBOARD': 'https://archives.nseindia.com/content/equities/EQUITY_L.csv',
    'SME': 'https://archives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv',
}

def header(value):
    return re.sub(r'[^A-Z0-9]', '', value.strip().upper())

def parse_directory(content: bytes, board: str):
    if board not in SOURCES or len(content) > 5_000_000: raise ValueError('Invalid NSE directory file')
    reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
    keys = {header(k): k for k in reader.fieldnames or []}
    required = ['SYMBOL', 'NAMEOFCOMPANY', 'SERIES', 'ISINNUMBER']
    if 'ISIN' in keys: keys.setdefault('ISINNUMBER', keys['ISIN'])
    if 'COMPANYNAME' in keys: keys.setdefault('NAMEOFCOMPANY', keys['COMPANYNAME'])
    if any(k not in keys for k in required):
        raise ValueError('Select the NSE Securities Available for Trading CSV with symbol, company, series and ISIN columns.')
    result = {}
    for r in reader:
        symbol, name, series, isin = [str(r.get(keys[k]) or '').strip() for k in required]
        symbol, series, isin = symbol.upper(), series.upper(), isin.upper()
        if not symbol and not name: continue
        if not re.fullmatch(r'[A-Z0-9&_.-]{1,50}', symbol) or not re.fullmatch(r'[A-Z0-9]{1,3}', series) or not re.fullmatch(r'IN[A-Z0-9]{10}', isin) or not name:
            raise ValueError('Invalid symbol, company, series or ISIN in NSE directory; existing directory retained.')
        # Stable LOCAL directory identifier; this is not a broker token.
        identity = str(int(hashlib.sha256(f'{isin}:{series}'.encode()).hexdigest()[:12], 16))
        result[(symbol, series)] = dict(token=identity, symbol=f'{symbol}-{series}', base_symbol=symbol,
            name=name, company_name=name, isin=isin, series=series, board=board, yahoo_symbol=f'{symbol}.NS')
    if not result: raise ValueError('The official NSE directory is empty.')
    return list(result.values())

def install_files(db, files, minimums=True, checked_at=None):
    if set(files) != set(SOURCES):
        raise ValueError('Select BOTH NSE mainboard EQUITY_L.csv and SME_EQUITY_L.csv to install the complete directory.')
    boards = {board: parse_directory(content, board) for board, content in files.items()}
    if minimums and (len(boards['MAINBOARD']) < 1000 or len(boards['SME']) < 100):
        raise ValueError('Incomplete NSE files; existing directory retained. Both complete official files are required.')
    combined = {r['symbol']: r for board in boards.values() for r in board}
    metadata = dict(source='NSE Securities Available for Trading', updated=checked_at if checked_at is not None else time.time(), count=len(combined),
        mainboard=len(boards['MAINBOARD']), sme=len(boards['SME']), urls=SOURCES)
    db.install(list(combined.values()), metadata)
    return metadata

def bootstrap(db, resources):
    if db.count(): return
    try:
        install_files(db, {'MAINBOARD': (resources/'EQUITY_L.csv').read_bytes(), 'SME': (resources/'SME_EQUITY_L.csv').read_bytes()}, checked_at=min((resources/name).stat().st_mtime for name in ('EQUITY_L.csv','SME_EQUITY_L.csv')))
    except (OSError, ValueError):
        db.put('catalogue_error', 'Loading official NSE mainboard and SME directories. If NSE is unavailable, import both official CSV files in Settings.')

def refresh(db):
    def fetch(item):
        board, url = item
        request = urllib.request.Request(url, headers={'User-Agent': 'IndianMarketTerminal/0.3 personal-analysis'})
        with urllib.request.urlopen(request, timeout=20) as response: content = response.read(5_000_001)
        return board, content
    with ThreadPoolExecutor(max_workers=2) as pool: files = dict(pool.map(fetch, SOURCES.items()))
    return install_files(db, files)

async def refresh_startup(db):
    if os.environ.get('IMT_OFFLINE') == '1': return
    db.put('directory_loading', True)
    try: await asyncio.to_thread(refresh, db)
    except Exception:
        db.put('catalogue_error', 'NSE directory download unavailable. Cached directory retained; import BOTH official CSV files in Settings if needed. No access restrictions are bypassed.')
    finally: db.put('directory_loading', False)
