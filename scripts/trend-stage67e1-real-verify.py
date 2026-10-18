"""Validate recorded bounded run and perform one supplementary Yahoo BSE probe.

No OHLC is persisted, only verification counts and provenance.
"""
import asyncio,json,sys,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
from app.main import create_app
from app.indicators import IndicatorCalculator
from app.trend_indicators import KINDS
async def main():
 p=root/'test-results/stage67e1-real.json';v=json.loads(p.read_text())
 assert len(v['verified_crypto'])==2
 for s in v['verified_crypto']:
  assert {r['interval'] for r in v['histories'] if r['canonical_id']==s['canonical_id']}=={'1m','5m','15m','30m','1h','4h','1d','1w','1M'}
 assert all(v['live_revisions'].values()) and v['provider_isolation']
 assert any('RELIANCE.NS' in r['canonical_id'] for r in v['histories']) and any('AAPL' in r['canonical_id'] for r in v['histories'])
 app=create_app(tempfile.mkdtemp(prefix='imt67e1-bse-'),'bse-verify-'+'x'*48);h=app.state.history;records=[]
 try:
  found=await app.state.discovery.search('State Bank of India',exchange='BSE')
  targets=[r for r in found['results'] if r['exchange']=='BSE' and r['kind']=='equity'][:1]
  if not targets:
   sec=app.state.registry.resolve('RELIANCE.BO');targets=[sec] if sec else []
  for s in targets:
   try:
    data=await h.get(s,'1d');out=IndicatorCalculator.calculate(data['candles'][-5000:],[dict(id=k,kind=k,reversal=.1) for k in KINDS]);records.append(dict(canonical_id=s['canonical_id'],source=data['source'],bars=len(data['candles']),valid_points={k:sum(p['value'] is not None for line in out['series'] if line['id']==k for p in line['points']) for k in KINDS}))
   except Exception as e:records.append(dict(canonical_id=s['canonical_id'],unavailable=str(e)))
  v['supplementary_bse']=dict(search_warning=found.get('warning'),records=records)
 finally:await h.close()
 v['verification_passed']=True;v['harness_note']='Initial final assertion incorrectly expected an equity: prefix, while preserved instrument identities are yahoo:...:equity. Corrected and validated the completed real run without repeating its 18 successful candle downloads.';p.write_text(json.dumps(v,indent=2));print(json.dumps(dict(passed=True,crypto_timeframes=18,histories=len(v['histories']),live_revisions=v['live_revisions'],bse=v['supplementary_bse']),indent=2))
asyncio.run(main())
