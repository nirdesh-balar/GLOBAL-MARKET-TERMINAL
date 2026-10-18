"""Refresh the two official NSE directory snapshots, never any candle data."""
import sys
from pathlib import Path
from urllib.request import Request, urlopen
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from app.instruments import SOURCES, parse_directory
files={}
for board,url in SOURCES.items():
    with urlopen(Request(url,headers={'User-Agent':'IndianMarketTerminal/0.3 personal-analysis'}),timeout=20) as response:
        files[board]=response.read(5_000_001)
    rows=parse_directory(files[board],board)
    minimum=1000 if board=='MAINBOARD' else 100
    if len(rows)<minimum: raise RuntimeError('NSE directory response is incomplete; snapshots unchanged.')
    print(board,len(rows),'official directory rows')
for board,name in [('MAINBOARD','EQUITY_L.csv'),('SME','SME_EQUITY_L.csv')]:
    Path('backend/resources',name).write_bytes(files[board])
