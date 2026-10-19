"""Independent test oracle for the actual ignored official CSV inputs, not app parsing."""
import csv
from pathlib import Path
import re

RESOURCES = Path(__file__).parents[1] / 'resources'
FIELDS = ('base_symbol', 'company_name', 'series', 'isin', 'board', 'yahoo_symbol')


def official_reference():
    boards = {}
    for board, filename in [('MAINBOARD', 'EQUITY_L.csv'), ('SME', 'SME_EQUITY_L.csv')]:
        with (RESOURCES / filename).open(encoding='utf-8-sig', newline='') as handle:
            rows = csv.reader(handle)
            headers = [''.join(c for c in h.upper() if c.isalnum()) for h in next(rows)]
            aliases = [('SYMBOL',), ('NAMEOFCOMPANY', 'COMPANYNAME'), ('SERIES',), ('ISINNUMBER', 'ISIN')]
            positions = [next(headers.index(k) for k in keys if k in headers) for keys in aliases]
            accepted = {}
            for row in rows:
                values = [row[i].strip() if i < len(row) else '' for i in positions]
                symbol, company, series, isin = values
                symbol, series, isin = symbol.upper(), series.upper(), isin.upper()
                if not symbol and not company:
                    continue
                if not (re.fullmatch(r'[A-Z0-9&_.-]{1,50}', symbol) and company and
                        re.fullmatch(r'[A-Z0-9]{1,3}', series) and re.fullmatch(r'IN[A-Z0-9]{10}', isin)):
                    raise ValueError('Official reference metadata invalid')
                # Official duplicate symbol/series rows resolve to the last occurrence.
                accepted[symbol + '-' + series] = dict(zip(FIELDS, (symbol, company, series, isin, board, symbol + '.NS')))
        boards[board] = accepted
    if len(boards['MAINBOARD']) < 1000 or len(boards['SME']) < 100:
        raise ValueError('Official reference coverage incomplete')
    return boards


def installed_reference(db):
    with db.connect() as connection:
        return {r['symbol']: {k: r[k] for k in FIELDS} for r in connection.execute('SELECT * FROM securities')}


def universe_reference(rows):
    return {r['base_symbol'] + '-' + r['series']: {k: r[k] for k in FIELDS} for r in rows}
