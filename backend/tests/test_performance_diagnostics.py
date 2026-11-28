from fastapi.testclient import TestClient

from app.main import create_app
from fixtures import FixtureProvider


def test_performance_counters_are_authenticated_and_read_only(tmp_path):
    token = 'performance-fixture-' + 'x' * 40
    provider = FixtureProvider(count=23)
    app = create_app(tmp_path, token, provider)
    with TestClient(app) as client:
        assert client.get('/api/performance').status_code == 401
        client.headers['Authorization'] = 'Bearer ' + token
        history = client.get('/api/history', params={'symbol': 'RELIANCE', 'source': 'yahoo'})
        assert history.status_code == 200, history.json()
        service = app.state.history
        service.last_error = 'private diagnostic detail'
        before = service.cache.entries.copy()

        def unexpected_trim():
            raise AssertionError('Diagnostics must leave the candle cache alone')

        original_trim = service.cache.trim
        try:
            service.cache.trim = unexpected_trim
            responses = [client.get('/api/performance') for _ in range(3)]
        finally:
            service.cache.trim = original_trim
        assert all(response.status_code == 200 for response in responses)
        measurements = [response.json() for response in responses]
        assert measurements[0] == measurements[1] == measurements[2]
        values = measurements[0]
        assert values['historyRequests'] == values['yahooHistoryAttempts'] == provider.calls == 1
        assert values['historyCacheBytes'] == service.cache.bytes > 0
        assert service.cache.entries == before
        assert values['historyError'] is True
        assert values['streamState'] == 'disabled'
        assert values['streamConnections'] == values['streamSubscriptions'] == 0
        assert values['hyperliquidCandleRequests'] is None
        assert 'private diagnostic detail' not in responses[0].text
