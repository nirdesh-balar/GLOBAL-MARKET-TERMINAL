"""Symbol color flags API: TradingView-style colored symbol markers and dynamic color watchlists."""
from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from .database import VALID_FLAG_COLORS
from .markets import entry

FlagColor = Literal['red', 'blue', 'green', 'yellow', 'purple', 'cyan', 'pink']
ORDERED_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'cyan', 'pink']

class SetFlagRequest(BaseModel):
    model_config = ConfigDict(extra='ignore')
    canonical_id: str | None = Field(default=None, max_length=300)
    color: FlagColor
    symbol: str = Field(min_length=1, max_length=180)
    name: str = Field(default='', max_length=200)
    exchange: str = Field(default='', max_length=80)
    provider: str = Field(default='yahoo', max_length=40)
    kind: str = Field(default='equity', max_length=40)
    metadata: dict = Field(default_factory=dict)

class RemoveFlagRequest(BaseModel):
    model_config = ConfigDict(extra='ignore')
    canonical_id: str = Field(min_length=1, max_length=300)

class ClearColorRequest(BaseModel):
    model_config = ConfigDict(extra='ignore')
    color: FlagColor
    confirm: bool = False

class ColorAliasRequest(BaseModel):
    model_config = ConfigDict(extra='ignore')
    color: FlagColor
    alias: str = Field(default='', max_length=64)

def flag_row_to_symbol_entry(row: dict) -> dict:
    meta = row.get('metadata') if isinstance(row.get('metadata'), dict) else {}
    item = {
        'id': meta.get('id') or meta.get('instrument_id') or row['canonical_id'],
        'symbol': row['symbol'],
        'token': str(meta.get('token', '0')),
        'instrument_id': meta.get('instrument_id') or meta.get('id') or row['canonical_id'],
        'kind': row['kind'],
        'name': row['name'],
        'exchange': row['exchange'],
        'canonical_id': row['canonical_id'],
        'provider': row['provider'],
        'category': meta.get('category'),
        'country': meta.get('country'),
        'currency': meta.get('currency'),
        'timezone': meta.get('timezone', 'Asia/Kolkata'),
        'calendar': meta.get('calendar'),
        'precision': meta.get('precision', 2),
        'contract': meta.get('contract', ''),
        'market_type': meta.get('market_type', 'cash'),
        'native_id': meta.get('native_id', row['symbol']),
        'base_asset': meta.get('base_asset', ''),
        'quote_asset': meta.get('quote_asset', ''),
        'identity_version': meta.get('identity_version', 1),
        'legacy_unresolved': meta.get('legacy_unresolved', False),
        'native_mapping': meta.get('native_mapping'),
        'size_decimals': meta.get('size_decimals'),
        'trading_availability': meta.get('trading_availability'),
        'verified_at': meta.get('verified_at')
    }
    return entry(item)

def compute_counts(flags: dict[str, dict]) -> dict[str, int]:
    counts = {c: 0 for c in ORDERED_COLORS}
    for f in flags.values():
        c = f.get('color')
        if c in counts:
            counts[c] += 1
    return counts

def routes(db, registry=None):
    router = APIRouter()

    @router.get('/api/flags')
    def get_flags():
        flags = db.get_flags()
        return {
            'flags': flags,
            'counts': compute_counts(flags),
            'aliases': db.get_color_aliases()
        }

    @router.post('/api/flags')
    def set_flag(req: SetFlagRequest):
        canonical_id = (req.canonical_id or '').strip()
        symbol = req.symbol.strip()
        name = req.name.strip()
        exchange = req.exchange.strip()
        provider = req.provider.strip()
        kind = req.kind.strip()
        meta = dict(req.metadata) if req.metadata else {}

        # Enrich with local registry metadata when available without network calls
        if registry:
            sec = registry.resolve(canonical_id or symbol)
            if sec:
                canonical_id = canonical_id or sec.get('canonical_id') or sec.get('id')
                symbol = symbol or sec.get('symbol')
                name = name or sec.get('name') or sec.get('company_name')
                exchange = exchange or sec.get('exchange')
                provider = provider or sec.get('provider')
                kind = kind or sec.get('kind')
                for k, v in sec.items():
                    if k not in meta and v is not None:
                        meta[k] = v

        if not canonical_id:
            canonical_id = f"{provider}:{symbol}:{exchange}:{kind}"

        result = db.set_flag(
            canonical_id=canonical_id,
            color=req.color,
            symbol=symbol,
            name=name or symbol,
            exchange=exchange,
            provider=provider or 'yahoo',
            kind=kind or 'equity',
            metadata=meta
        )
        flags = db.get_flags()
        return {
            'flag': result,
            'flags': flags,
            'counts': compute_counts(flags)
        }

    @router.post('/api/flags/remove')
    def remove_flag_post(req: RemoveFlagRequest):
        db.remove_flag(req.canonical_id)
        flags = db.get_flags()
        return {
            'removed': True,
            'canonical_id': req.canonical_id,
            'flags': flags,
            'counts': compute_counts(flags)
        }

    @router.delete('/api/flags/{canonical_id:path}')
    def remove_flag_delete(canonical_id: str):
        db.remove_flag(canonical_id)
        flags = db.get_flags()
        return {
            'removed': True,
            'canonical_id': canonical_id,
            'flags': flags,
            'counts': compute_counts(flags)
        }

    @router.post('/api/flags/clear')
    def clear_color(req: ClearColorRequest):
        if not req.confirm:
            raise HTTPException(422, f"Confirm clearing all items in the {req.color.title()} List.")
        cleared = db.clear_color_flags(req.color)
        flags = db.get_flags()
        return {
            'cleared': cleared,
            'color': req.color,
            'flags': flags,
            'counts': compute_counts(flags)
        }

    @router.get('/api/flags/aliases')
    def get_aliases():
        return {'aliases': db.get_color_aliases()}

    @router.post('/api/flags/aliases')
    @router.put('/api/flags/aliases')
    def set_alias(req: ColorAliasRequest):
        try:
            aliases = db.set_color_alias(req.color, req.alias)
        except ValueError as e:
            raise HTTPException(422, str(e)) from None
        return {'aliases': aliases}

    @router.get('/api/flags/list/{color}')
    def get_color_list(color: str):
        c = color.lower().strip()
        if c not in VALID_FLAG_COLORS:
            raise HTTPException(404, f"Unknown color: {color}")
        rows = db.get_flags_by_color(c)
        items = [flag_row_to_symbol_entry(r) for r in rows]
        aliases = db.get_color_aliases()
        name = aliases.get(c) or f"{c.title()} List"
        return {
            'id': f'color:{c}',
            'color': c,
            'name': name,
            'items': items,
            'total': len(items)
        }

    return router
