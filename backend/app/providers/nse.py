"""Permitted fallback: manually selected official NSE bhavcopy files, RAM only.
No undocumented historical endpoints, scraping, cookies, or paid subscriptions.
"""
import csv
import io
import math
import zipfile
from datetime import datetime
from .base import History, ProviderError
from .yahoo import trading_time, IST
from ..instruments import header

MAX_UNPACKED = 64_000_000

def csv_contents(name, content):
    if len(content) > MAX_UNPACKED: raise ProviderError('NSE archive file is too large (64 MB limit).', 'file')
    if name.lower().endswith('.zip'):
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                entries = [r for r in z.infolist() if not r.is_dir() and r.filename.lower().endswith('.csv')]
                if not entries or len(entries)>50 or sum(r.file_size for r in entries)>MAX_UNPACKED:
                    raise ProviderError('Select a bounded official CSV bhavcopy ZIP (unpacked limit 64 MB).', 'file')
                for entry in entries: yield z.read(entry)
        except (zipfile.BadZipFile, RuntimeError): raise ProviderError('The selected NSE ZIP file is invalid.', 'file') from None
    elif name.lower().endswith('.csv'): yield content
    else: raise ProviderError('Select official NSE CSV or ZIP bhavcopy files.', 'file')

def parse_bhavcopy(content, security):
    try:
        reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
        keys = {header(k):k for k in reader.fieldnames or []}
        aliases = {
            'symbol': ['TCKRSYMB','SYMBOL'], 'series':['SCTYSRS','SERIES'],
            'date':['TRADDT','TIMESTAMP','DATE1','DATE'], 'open':['OPNPRIC','OPEN','OPENPRICE'],
            'high':['HGHPRIC','HIGH','HIGHPRICE'], 'low':['LWPRIC','LOW','LOWPRICE'],
            'close':['CLSPRIC','CLOSE','CLOSEPRICE'], 'volume':['TTLTRADGVOL','TOTTRDQTY','TTLTRDQNTY'],
            'isin':['ISIN','ISINNUMBER']}
        columns = {k:next((keys[a] for a in aliases[k] if a in keys),None) for k in aliases}
        if any(columns[k] is None for k in ['symbol','series','date','open','high','low','close','volume']):
            raise ProviderError('Unsupported NSE file. Select CM UDiFF or legacy equity bhavcopy CSV/ZIP with symbol, series, date and OHLCV.', 'file')
        rows = []
        for r in reader:
            if str(r.get(columns['symbol'],'')).strip().upper()!=security['base_symbol'] or str(r.get(columns['series'],'')).strip().upper()!=security['series']: continue
            if columns['isin'] and str(r.get(columns['isin'],'')).strip() not in ('', security['isin']):
                raise ProviderError('ISIN in NSE archive does not match the currently listed security.', 'file')
            rawdate = r[columns['date']].strip()
            parsed = None
            for fmt in ('%Y-%m-%d','%d-%b-%Y','%d-%m-%Y','%d/%m/%Y','%d-%b-%y'):
                try: parsed=datetime.strptime(rawdate,fmt).date();break
                except ValueError: pass
            if not parsed or parsed>datetime.now(IST).date(): raise ProviderError('NSE archive contains an invalid or future trading date.', 'file')
            values = [float(r[columns[k]].strip().replace(',','')) for k in ['open','high','low','close','volume']]
            o,h,l,c,v=values
            if not all(math.isfinite(x) for x in values) or min(o,h,l,c)<=0 or v<0 or h<max(o,l,c) or l>min(o,h,c):
                raise ProviderError('NSE file contains invalid OHLCV; import rejected.', 'file')
            rows.append(dict(time=trading_time(parsed),open=o,high=h,low=l,close=c,volume=v,adj_close=None))
        return rows
    except (UnicodeError, ValueError, KeyError, csv.Error):
        raise ProviderError('Could not read this official NSE file. Check its CSV format.', 'file') from None

class NSEHistoricalProvider:
    name = 'NSE OFFICIAL FILES'
    def parse_files(self, security, files):
        rows={}
        for name,content in files:
            for csvdata in csv_contents(name,content):
                for row in parse_bhavcopy(csvdata,security):
                    if row['time'] in rows and rows[row['time']]!=row:
                        raise ProviderError('Conflicting NSE candles for the same date. Select matching official files.', 'file')
                    rows[row['time']]=row
        if not rows: raise ProviderError('No rows match this current NSE symbol AND trading series in the selected official files.', 'missing')
        return History([rows[t] for t in sorted(rows)], self.name, notice='Official NSE files selected by you. Only selected file dates are available. OHLC is unadjusted; corporate-action adjustment is unavailable. Nothing is saved to disk.')
    def fetch_daily(self, security):
        raise ProviderError('Select official NSE historical CSV/ZIP files in this chart. Automated archive access is not assumed.', 'manual')
    def close(self): pass
