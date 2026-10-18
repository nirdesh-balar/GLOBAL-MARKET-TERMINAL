"""Use current Yahoo discovery to choose a verified BSE primary sample."""
import sys,os,asyncio,json
from pathlib import Path
sys.path.insert(0,'backend');os.environ['IMT_OFFLINE']='1'
from app.main import create_app
async def main():
 p=Path('test-results/stage7-market-discovery.json');v=json.loads(p.read_text());app=create_app(v['profile'],'stage7-bse-'+'x'*48);checks=[]
 try:
  for symbol in ['TCS.BO','SBIN.BO','HDFCBANK.BO']:
   rows=await app.state.discovery.download(symbol);row=next((r for r in rows if r['yahoo_symbol']==symbol and r['provider']=='yahoo'),None);checks.append({'query':symbol,'resolved':bool(row)})
   if row:
    original=next(r for r in v['results']if r['category']=='BSE equity');v['bse_original_discovery']=original;v['results'][v['results'].index(original)]={'category':'BSE equity','query':symbol,'search_resolved':True,'identity':row};break
  assert any(c['resolved'] for c in checks),'No current BSE identity resolved';v['bse_primary_checks']=checks;p.write_text(json.dumps(v,indent=2));print(checks)
 finally:await app.state.discovery.close();await app.state.streams.close();await app.state.history.close()
asyncio.run(main())
