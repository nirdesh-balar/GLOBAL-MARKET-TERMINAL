"""Stable product identity without reading or creating any normal user profile."""
import json
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import create_app

ROOT = Path(__file__).resolve().parents[2]

def test_stable_package_identity():
    data = json.loads((ROOT / 'package.json').read_text())
    assert data['productName'] == data['build']['productName'] == 'GLOBAL MARKET TERMINAL'
    assert data['version'] == '1.0.0'
    assert data['build']['appId'] == 'local.globalmarket.terminal'
    assert data['build']['mac']['extendInfo']['CFBundleDisplayName'] == 'GLOBAL MARKET TERMINAL'

def test_stable_backend_name_and_version(tmp_path):
    app = create_app(tmp_path, 'test-stage7-' + 'x' * 48)
    assert app.title == 'GLOBAL MARKET TERMINAL local service'
    # The explicitly isolated database is the only database opened.
    assert (tmp_path / 'terminal.sqlite3').exists()
    with TestClient(app) as client:
        response = client.get('/health', headers={'Authorization': 'Bearer ' + 'test-stage7-' + 'x' * 48})
        assert response.status_code == 200
        assert response.json()['version'] == '1.0.0'

def test_branding_surfaces():
    assert '<title>GLOBAL MARKET TERMINAL</title>' in (ROOT / 'desktop/index.html').read_text()
    header = (ROOT / 'desktop/src/components/TerminalHeader.tsx').read_text()
    assert '<strong>GMT</strong>' in header
    assert 'Indian Market Terminal' not in header
    app_source = (ROOT / 'desktop/src/App.tsx').read_text()
    assert '<h1>GLOBAL MARKET TERMINAL</h1>' in app_source
    assert 'indian market terminal' not in app_source.lower()
    assert '<span className="titlebar-name">GLOBAL MARKET TERMINAL</span>' in app_source
