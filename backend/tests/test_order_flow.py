import asyncio
import copy
import json
import time
from decimal import Decimal

import pytest

from app.hyperliquid_stream import Feed, feed_key, subscription, wire
from app.order_flow import BOOK_FEED, FLOW_OWNER, TAPE_LIMIT, TAPE_WINDOW_MS, TradeTape, normalize_book
from app.providers.base import ProviderError
from test_hyperliquid import market
from test_hyperliquid_stream import consumer, setup


def snapshot(native='BTC', stamp=100_000):
    return dict(coin=native, time=stamp, levels=[
        [dict(px=str(price), sz='2.5', n=2) for price in range(96, 101)],
        [dict(px=str(price), sz='1.25', n=1) for price in range(105, 100, -1)],
    ])


def live_print(stamp, ident, native='BTC'):
    return dict(coin=native, time=stamp, tid=ident, px='100.125', sz='0.125', side='A',
                users=['test-participant-one', 'test-participant-two'])


def demand(row=None):
    return [consumer(row, FLOW_OWNER, name, '') for name in (BOOK_FEED, 'trades')]


async def eventually(condition, timeout=5):
    async with asyncio.timeout(timeout):
        while not condition():
            await asyncio.sleep(.02)


@pytest.mark.parametrize('native,kind',[('BTC','perpetual'),('@1','spot')])
def test_public_order_book_protocol_and_snapshot_math(native,kind):
    row = market(native,kind)
    assert wire('subscribe',subscription(BOOK_FEED,row)) == {
        'method':'subscribe','subscription':{'type':'l2Book','coin':native},
    }
    with pytest.raises(ProviderError):
        subscription(BOOK_FEED,row,'1m')
    with pytest.raises(ProviderError):
        wire('subscribe',{'type':'l2Book','coin':native,'user':'invalid'})
    result = normalize_book(snapshot(native), native, 100_000)
    assert [level['price'] for level in result['bids']] == ['100','99','98','97','96']
    assert [level['price'] for level in result['asks']] == ['101','102','103','104','105']
    assert result['spread'] == '1'
    assert abs(Decimal(result['spread_percent']) - Decimal(100) / Decimal('100.5')) < Decimal('0.00000001')
    assert result['bids'][-1]['cumulative'] == '12.5'
    assert result['asks'][-1]['cumulative'] == '6.25'
    assert result['imbalance_depth'] == 5
    assert result['imbalance'] == '0.33333333'


@pytest.mark.parametrize('problem',['wrong-market','future','duplicate','crossed','price','size','count','oversized'])
def test_malformed_snapshots_rejected_atomically(problem):
    data = snapshot()
    match problem:
        case 'wrong-market': data['coin'] = '@1'
        case 'future': data['time'] += 1001
        case 'duplicate': data['levels'][0].append(dict(px='100.0',sz='1',n=1))
        case 'crossed': data['levels'][0][-1]['px'] = '102'
        case 'price': data['levels'][0][0]['px'] = 'Infinity'
        case 'size': data['levels'][1][0]['sz'] = '-1'
        case 'count': data['levels'][0][0]['n'] = True
        case 'oversized': data['levels'][0] *= 21
    with pytest.raises(ProviderError):
        normalize_book(data,'BTC',100_000)


def test_partial_and_empty_book_do_not_invent_metrics():
    data = snapshot()
    data['levels'][0] = data['levels'][0][:2]
    partial = normalize_book(data,'BTC',100_000)
    assert partial['spread'] is not None and partial['imbalance'] is None
    data['levels'][0] = []
    empty = normalize_book(data,'BTC',100_000)
    assert empty['bids'] == [] and empty['spread'] is empty['spread_percent'] is empty['imbalance'] is None


def test_tape_delta_capacity_privacy_and_time_window():
    tape = TradeTape(1,100_000)
    for index in range(TAPE_LIMIT+2):
        assert tape.append(dict(time_ms=100_000+index,tid=index,price_text='100',size_text='1',side=None),
                           index+1,101_500)
    assert not tape.append(dict(time_ms=101_001,tid=1001),1010,101_500)
    assert not tape.append(dict(time_ms=99_999,tid=2000),1011,101_500)
    delta = tape.frame(1,101_500)
    assert delta['cursor_gap'] and delta['evicted']==2 and delta['retained']==TAPE_LIMIT
    assert len(tape.frame(1001,101_500)['trades'])==1
    assert tape.trim(101_500+TAPE_WINDOW_MS)
    assert not tape.rows


def test_shared_tape_ownership_keeps_watchlist_and_never_requests_history(tmp_path):
    async def run():
        app, manager, connector, transport = await setup(tmp_path)
        watch = consumer(None,'watchlist:selected','trades','')
        try:
            await manager.plan([watch]+demand())
            trade_key = feed_key(market(),'trades')
            book_key = feed_key(market(),BOOK_FEED)
            await eventually(lambda: manager.feeds[book_key].book and manager.feeds[trade_key].tape.rows)
            result = await manager.events(0,0)
            book, trades = (next(row for row in result['feeds'] if row['key']==key) for key in (book_key,trade_key))
            assert book['state']=='live' and book['generation']==1
            assert trades['refs']==2 and trades['tape']['trades'][0]['side']=='B'
            assert result['status']['connection_count']==1 and manager.metrics['sent_subscribe']==2
            now = int(time.time()*1000)
            print_row = live_print(now,1000)
            manager.receive(dict(channel='trades',data=[print_row,print_row]))
            recorded=(await manager.events(0,0))['feeds']
            tape=next(row['tape'] for row in recorded if row['key']==trade_key)
            assert sum(row['id']==1000 for row in tape['trades'])==1
            assert 'test-participant' not in json.dumps(recorded)
            quote=manager.feeds[trade_key].quote
            with pytest.raises(ProviderError):
                manager.receive(dict(channel='trades',data=[live_print(now,1001),dict(print_row,px='NaN')]))
            frame=next(row for row in (await manager.events(0,0))['feeds'] if row['key']==trade_key)
            assert any(row['id']==1001 for row in frame['tape']['trades'])
            assert frame['tape']['last_gap_ms'] and manager.feeds[trade_key].quote==quote
            assert not any(call['type']=='candleSnapshot' for call in transport.calls)
            await manager.plan([watch])
            await eventually(lambda: manager.metrics['sent_unsubscribe']==1)
            assert list(manager.feeds)==[trade_key] and manager.feeds[trade_key].tape is None
            assert len(connector.sockets)==1
        finally:
            await manager.close()
            await app.state.history.close()
    asyncio.run(run())


def test_old_generation_book_rejected_and_tape_gap_survives_reconnect(tmp_path):
    async def run():
        app, manager, connector, _ = await setup(tmp_path)
        try:
            await manager.plan(demand())
            feed = manager.feeds[feed_key(market(),BOOK_FEED)]
            tape = manager.feeds[feed_key(market(),'trades')].tape
            await eventually(lambda: feed.state=='live' and tape.rows)
            await connector.sockets[0].close()
            await eventually(lambda: manager.generation==2 and feed.state=='live',timeout=8)
            assert tape.last_gap_ms and len(connector.sockets)==2
            previous = copy.deepcopy(feed.book)
            manager.receive(dict(channel=BOOK_FEED,data=snapshot(stamp=int(time.time()*1000))),generation=1)
            assert feed.book==previous
            await manager.lifecycle(True)
            await eventually(lambda: manager.socket is None)
            assert manager.status()['paused'] and tape.last_gap_ms
        finally:
            await manager.close()
            await app.state.history.close()
    asyncio.run(run())


def test_order_flow_scope_and_existing_demand_priority(tmp_path):
    async def run():
        app, manager, _, _ = await setup(tmp_path)
        try:
            with pytest.raises(ProviderError):
                await manager.plan([consumer(None,'watchlist:selected',BOOK_FEED,'')])
            with pytest.raises(ProviderError):
                await manager.plan([demand()[0], demand(market('@1','spot'))[1]])
            assert not manager.feeds
            manager.LIMIT=2
            watch=consumer(None,'watchlist:selected','trades','')
            alert=consumer(market('@1','spot'),'alert:1','trades','')
            combined, allocation, flow = manager.consumer_plan([watch]+demand(),[alert])
            assert combined==[watch,alert] and allocation['alert:1']=='stream'
            assert flow['state']=='limited'
        finally:
            await manager.close()
            await app.state.history.close()
    asyncio.run(run())


def test_old_snapshot_stays_stale_and_invalid_update_preserves_book(tmp_path):
    async def run():
        app, manager, _, _ = await setup(tmp_path,clock=lambda:100)
        try:
            row=market()
            feed=Feed(row,BOOK_FEED)
            manager.feeds[feed_key(row,BOOK_FEED)]=feed
            data=snapshot(stamp=80_000)
            manager.receive(dict(channel=BOOK_FEED,data=data))
            assert feed.state=='stale'
            earlier=feed.book
            invalid=snapshot(stamp=100_000)
            invalid['levels'][0][-1]['px']='105'
            with pytest.raises(ProviderError):
                manager.receive(dict(channel=BOOK_FEED,data=invalid))
            assert feed.book==earlier and feed.state=='stale'
        finally:
            await manager.close()
            await app.state.history.close()
    asyncio.run(run())
