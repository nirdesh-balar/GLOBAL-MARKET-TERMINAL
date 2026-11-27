"""Local, user-imported index membership, separate from Yahoo quote data."""
import csv
import hashlib
import io
import re
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

SOURCES = {
    '^NSEI': ('ind_nifty50list.csv', 50),
    '^CRSLDX': ('ind_nifty500list.csv', 500),
}
ARCHIVE = 'https://nsearchives.nseindia.com/content/indices/'
COLUMNS = {'company name', 'industry', 'symbol', 'series', 'isin code'}


class MembershipImport(BaseModel):
    model_config = ConfigDict(extra='forbid')
    index: str = Field(max_length=150)
    name: str = Field(max_length=120)
    content: str = Field(min_length=1, max_length=256_000)
    as_of: date | None = None


def parse_members(content, count):
    reader = csv.DictReader(io.StringIO(content.removeprefix('\ufeff')), strict=True)
    columns = [name.strip().lower() for name in reader.fieldnames or ()]
    if len(columns) != len(COLUMNS) or set(columns) != COLUMNS:
        raise ValueError('Expected the official Company Name, Industry, Symbol, Series and ISIN Code columns.')
    reader.fieldnames = columns
    members, symbols, isins = [], set(), set()
    for row in reader:
        if len(members) >= count or None in row or None in row.values():
            raise ValueError(f'Expected exactly {count} complete constituent rows.')
        name, symbol, series, isin = (row[key].strip() for key in ('company name', 'symbol', 'series', 'isin code'))
        if not 1 <= len(name) <= 200 or not name.isprintable() or not re.fullmatch(r'[A-Z0-9][A-Z0-9&-]{0,29}', symbol):
            raise ValueError('A constituent name or NSE symbol is invalid.')
        if not re.fullmatch(r'[A-Z0-9]{2}', series) or not re.fullmatch(r'IN[A-Z0-9]{9}[0-9]', isin):
            raise ValueError('A constituent series or ISIN is invalid.')
        if symbol in symbols or isin in isins:
            raise ValueError('The constituent CSV contains a duplicate symbol or ISIN.')
        members.append(dict(name=name, symbol=symbol, series=series, isin=isin))
        symbols.add(symbol)
        isins.add(isin)
    if len(members) != count:
        raise ValueError(f'Expected exactly {count} distinct constituents.')
    return members


def routes(db, registry, quotes):
    router = APIRouter(prefix='/api/indices/membership')

    def resolve(identity):
        index = registry.resolve(identity)
        if not index or index['kind'] != 'index' or index['canonical_id'] != identity:
            raise HTTPException(404, 'Unknown canonical index.')
        return index

    def keys(index):
        return 'index_membership:' + index['canonical_id']

    @router.get('')
    def membership(index: str):
        security = resolve(index)
        source = SOURCES.get(security['yahoo_symbol'])
        if not source:
            return dict(source_url=None, snapshot=None)
        record = db.get(keys(security))
        if record:
            directory = {(r['isin'], r['series']):r for r in db.search('', 20000)}
            rows = []
            for member in record['members']:
                instrument = registry.equity(directory.get((member['isin'], member['series'])))
                cached = quotes.cached_quote(instrument, '1d') if instrument else None
                rows.append(dict(**member, instrument=instrument, weight=None, quote=cached))
            record = {**record, 'members': rows}
        return dict(source_url=ARCHIVE + source[0], snapshot=record)

    @router.post('/import')
    def import_membership(payload: MembershipImport):
        index = resolve(payload.index)
        source = SOURCES.get(index['yahoo_symbol'])
        if not source or payload.name.lower() != source[0]:
            raise HTTPException(422, 'Select the official constituent CSV for this index using its published filename.')
        now = datetime.now(timezone.utc)
        if payload.as_of and payload.as_of > now.astimezone(ZoneInfo('Asia/Kolkata')).date():
            raise HTTPException(422, 'The membership date cannot be in the future.')
        try:
            members = parse_members(payload.content, source[1])
        except (csv.Error, ValueError) as error:
            raise HTTPException(422, str(error)) from error
        db.put(keys(index), dict(
            source='NSE Indices CSV · local import', filename=source[0], imported_at=now.isoformat(),
            as_of=payload.as_of.isoformat() if payload.as_of else None,
            sha256=hashlib.sha256(payload.content.encode('utf-8')).hexdigest(), members=members,
        ))
        return dict(count=len(members))

    return router
