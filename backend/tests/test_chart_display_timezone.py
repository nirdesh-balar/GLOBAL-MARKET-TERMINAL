from test_direct_history import app, client


def test_chart_display_timezone_round_trip_and_invalid_update_is_atomic(client):
    original = client.get('/workspace').json()
    assert original['panes'][0]['display_timezone'] is None

    first = original['panes'][0]
    first['display_timezone'] = 'America/New_York'
    saved = client.put('/workspace', json=original)
    assert saved.status_code == 200
    persisted = client.get('/workspace').json()
    assert persisted['panes'][0]['display_timezone'] == 'America/New_York'
    assert persisted['panes'][0]['timezone'] == first['timezone']
    assert persisted['panes'][0]['drawing_sets'] == first['drawing_sets']
    assert persisted['panes'][1:] == original['panes'][1:]

    original['panes'][0]['display_timezone'] = 'Invalid/Zone'
    rejected = client.put('/workspace', json=original)
    assert rejected.status_code == 422
    assert client.get('/workspace').json() == persisted
