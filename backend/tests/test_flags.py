"""Comprehensive tests for Phase F1 Colored Symbol Flags and Dynamic Color Watchlists."""
import io
import json
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from app.database import Database, VALID_FLAG_COLORS
from app.flags import routes as flag_routes, FlagColor, ORDERED_COLORS
from app.main import create_app, restore_workspace
from app.watchlists import Watchlists, CSVInput, Commit

@pytest.fixture
def temp_db(tmp_path):
    db_file = tmp_path / "test_terminal.sqlite3"
    db = Database(db_file)
    return db

def test_database_flag_crud_operations(temp_db):
    """Test assigning, reassigning, removing, and querying flags in SQLite."""
    # Initially empty
    assert temp_db.get_flags() == {}
    assert temp_db.get_flags_by_color("red") == []

    # Assign RED flag to RELIANCE
    res = temp_db.set_flag(
        canonical_id="yahoo:RELIANCE.NS:NSE:equity",
        color="red",
        symbol="RELIANCE-EQ",
        name="Reliance Industries Limited",
        exchange="NSE",
        provider="yahoo",
        kind="equity",
        metadata={"token": "87039203244675"}
    )
    assert res["color"] == "red"
    assert res["symbol"] == "RELIANCE-EQ"

    # Query flags
    flags = temp_db.get_flags()
    assert "yahoo:RELIANCE.NS:NSE:equity" in flags
    assert flags["yahoo:RELIANCE.NS:NSE:equity"]["color"] == "red"
    assert len(temp_db.get_flags_by_color("red")) == 1

    # Reassign RELIANCE to GREEN (atomic move between color lists)
    res2 = temp_db.set_flag(
        canonical_id="yahoo:RELIANCE.NS:NSE:equity",
        color="green",
        symbol="RELIANCE-EQ",
        name="Reliance Industries Limited",
        exchange="NSE",
        provider="yahoo",
        kind="equity",
        metadata={"token": "87039203244675"}
    )
    assert res2["color"] == "green"
    assert len(temp_db.get_flags_by_color("red")) == 0
    assert len(temp_db.get_flags_by_color("green")) == 1

    # Idempotent reassign to GREEN again
    res3 = temp_db.set_flag(
        canonical_id="yahoo:RELIANCE.NS:NSE:equity",
        color="green",
        symbol="RELIANCE-EQ",
        name="Reliance Industries Limited",
        exchange="NSE",
        provider="yahoo",
        kind="equity",
        metadata={"token": "87039203244675"}
    )
    assert res3["color"] == "green"
    assert len(temp_db.get_flags_by_color("green")) == 1

    # Remove flag
    removed = temp_db.remove_flag("yahoo:RELIANCE.NS:NSE:equity")
    assert removed is True
    assert temp_db.get_flags() == {}
    assert len(temp_db.get_flags_by_color("green")) == 0

    # Idempotent remove of nonexistent flag
    assert temp_db.remove_flag("yahoo:RELIANCE.NS:NSE:equity") is False

def test_invalid_color_validation(temp_db):
    """Validation rejects invalid colors and preserves valid colors."""
    with pytest.raises(ValueError, match="Invalid flag color"):
        temp_db.set_flag("test:id", "orange", "TEST", "Test Inc", "NSE", "yahoo", "equity")

    with pytest.raises(ValueError, match="Invalid flag color"):
        temp_db.clear_color_flags("invalid_color")

    with pytest.raises(ValueError, match="Invalid flag color"):
        temp_db.set_color_alias("black", "Blacklist")

def test_all_seven_colors_supported(temp_db):
    """Verify all 7 required colors work properly: red, blue, green, yellow, purple, cyan, pink."""
    expected_colors = {"red", "blue", "green", "yellow", "purple", "cyan", "pink"}
    assert VALID_FLAG_COLORS == expected_colors

    for i, col in enumerate(ORDERED_COLORS):
        cid = f"yahoo:SYM{i}.NS:NSE:equity"
        temp_db.set_flag(cid, col, f"SYM{i}", f"Company {i}", "NSE", "yahoo", "equity")
        assert len(temp_db.get_flags_by_color(col)) == 1

    all_flags = temp_db.get_flags()
    assert len(all_flags) == 7

def test_exchange_provider_identity_separation(temp_db):
    """Symbols with same text but different provider or exchange must have separate canonical flags."""
    # Yahoo spot BTC vs Hyperliquid BTC
    temp_db.set_flag("yahoo:BTC-USD:CC:crypto", "red", "BTC-USD", "Bitcoin USD", "CC", "yahoo", "crypto")
    temp_db.set_flag("hyperliquid:BTC:spot", "blue", "BTC", "Bitcoin Spot", "Hyperliquid", "hyperliquid", "crypto")
    temp_db.set_flag("hyperliquid:BTC:perpetual", "green", "BTC", "Bitcoin Perp", "Hyperliquid", "hyperliquid", "future")

    flags = temp_db.get_flags()
    assert len(flags) == 3
    assert flags["yahoo:BTC-USD:CC:crypto"]["color"] == "red"
    assert flags["hyperliquid:BTC:spot"]["color"] == "blue"
    assert flags["hyperliquid:BTC:perpetual"]["color"] == "green"

def test_persistence_across_database_reconnection(tmp_path):
    """Flags must persist across database close and reopen."""
    db_file = tmp_path / "persist_test.sqlite3"
    db1 = Database(db_file)
    db1.set_flag("yahoo:TCS.NS:NSE:equity", "blue", "TCS-EQ", "Tata Consultancy", "NSE", "yahoo", "equity")
    db1.set_color_alias("blue", "Core Holdings")

    # Reopen same database file
    db2 = Database(db_file)
    flags = db2.get_flags()
    assert "yahoo:TCS.NS:NSE:equity" in flags
    assert flags["yahoo:TCS.NS:NSE:equity"]["color"] == "blue"
    assert db2.get_color_aliases() == {"blue": "Core Holdings"}

def test_clear_color_flags_and_confirmation(temp_db):
    """Clearing a color list unflags only symbols of that color and leaves other colors and data intact."""
    temp_db.set_flag("yahoo:A:NSE:equity", "red", "A", "A", "NSE", "yahoo", "equity")
    temp_db.set_flag("yahoo:B:NSE:equity", "red", "B", "B", "NSE", "yahoo", "equity")
    temp_db.set_flag("yahoo:C:NSE:equity", "blue", "C", "C", "NSE", "yahoo", "equity")

    assert len(temp_db.get_flags_by_color("red")) == 2
    assert len(temp_db.get_flags_by_color("blue")) == 1

    cleared = temp_db.clear_color_flags("red")
    assert cleared == 2
    assert len(temp_db.get_flags_by_color("red")) == 0
    # Blue is preserved
    assert len(temp_db.get_flags_by_color("blue")) == 1

def test_legacy_watchlists_and_settings_preservation(temp_db):
    """Existing watchlists and settings tables are unaffected by flag operations."""
    temp_db.put("custom_pref", {"theme": "dark", "layout": 4})
    with temp_db.connect() as c:
        c.execute("INSERT INTO watchlists VALUES(?, ?)", ("Tech", json.dumps([{"symbol": "INFY-EQ"}])))

    temp_db.set_flag("yahoo:INFY.NS:NSE:equity", "purple", "INFY-EQ", "Infosys", "NSE", "yahoo", "equity")

    # Settings and watchlists still intact
    assert temp_db.get("custom_pref") == {"theme": "dark", "layout": 4}
    with temp_db.connect() as c:
        row = c.execute("SELECT items FROM watchlists WHERE name='Tech'").fetchone()
        assert json.loads(row["items"]) == [{"symbol": "INFY-EQ"}]

def test_flags_api_endpoints(tmp_path):
    """Test full HTTP API endpoints with FastAPI test client."""
    app = create_app(data_dir=str(tmp_path), token="test_token_at_least_32_characters_long_12345")
    client = TestClient(app)
    headers = {"Authorization": "Bearer test_token_at_least_32_characters_long_12345"}

    # GET /api/flags initially empty
    resp = client.get("/api/flags", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["flags"] == {}
    assert all(data["counts"][c] == 0 for c in ORDERED_COLORS)

    # POST /api/flags
    set_resp = client.post("/api/flags", headers=headers, json={
        "canonical_id": "yahoo:RELIANCE.NS:NSE:equity",
        "color": "red",
        "symbol": "RELIANCE-EQ",
        "name": "Reliance Industries Limited",
        "exchange": "NSE",
        "provider": "yahoo",
        "kind": "equity"
    })
    assert set_resp.status_code == 200
    set_data = set_resp.json()
    assert set_data["flag"]["color"] == "red"
    assert set_data["counts"]["red"] == 1

    # GET /api/flags/list/red
    list_resp = client.get("/api/flags/list/red", headers=headers)
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["color"] == "red"
    assert len(list_data["items"]) == 1
    assert list_data["items"][0]["symbol"] == "RELIANCE-EQ"

    # POST /api/flags/aliases
    alias_resp = client.post("/api/flags/aliases", headers=headers, json={
        "color": "red",
        "alias": "Priority Action"
    })
    assert alias_resp.status_code == 200
    assert alias_resp.json()["aliases"]["red"] == "Priority Action"

    # Check list name reflects alias
    list_resp2 = client.get("/api/flags/list/red", headers=headers)
    assert list_resp2.json()["name"] == "Priority Action"

    # POST /api/flags/clear without confirm must fail 422
    clear_fail = client.post("/api/flags/clear", headers=headers, json={
        "color": "red",
        "confirm": False
    })
    assert clear_fail.status_code == 422

    # POST /api/flags/clear with confirm=True
    clear_ok = client.post("/api/flags/clear", headers=headers, json={
        "color": "red",
        "confirm": True
    })
    assert clear_ok.status_code == 200
    assert clear_ok.json()["cleared"] == 1
    assert clear_ok.json()["counts"]["red"] == 0

    # DELETE /api/flags/{canonical_id}
    client.post("/api/flags", headers=headers, json={
        "canonical_id": "yahoo:TCS.NS:NSE:equity",
        "color": "blue",
        "symbol": "TCS-EQ"
    })
    del_resp = client.delete("/api/flags/yahoo:TCS.NS:NSE:equity", headers=headers)
    assert del_resp.status_code == 200
    assert del_resp.json()["removed"] is True

def test_csv_import_roundtrip_with_color(tmp_path):
    """Test CSV import preview and commit with optional color flag column."""
    app = create_app(data_dir=str(tmp_path), token="test_token_at_least_32_characters_long_12345")
    db = app.state.db
    registry = app.state.registry
    service = Watchlists(db, registry, lambda: restore_workspace(db, registry))

    # CSV with color column
    csv_content = (
        "symbol,exchange,asset_type,provider,name,canonical_id,instrument_id,color\n"
        "RELIANCE-EQ,NSE,equity,yahoo,Reliance Industries Limited,yahoo:RELIANCE.NS:NSE:equity,equity:INE002A01018:EQ,red\n"
        "TCS-EQ,NSE,equity,yahoo,Tata Consultancy Services,yahoo:TCS.NS:NSE:equity,equity:INE467B01029:EQ,blue\n"
    )

    csv_in = CSVInput(content=csv_content)
    preview = service.preview(csv_in)
    assert preview["needs_mapping"] is False
    assert preview["counts"]["valid"] == 2
    assert preview["rows"][0]["status"] == "valid"
    assert preview["rows"][0]["color"] == "red"
    assert preview["rows"][1]["status"] == "valid"
    assert preview["rows"][1]["color"] == "blue"

    # Commit import
    commit = Commit(
        content=csv_content,
        preview_hash=preview["preview_hash"],
        name="Imported With Flags",
        mode="append",
        revision=0
    )
    res = service.commit(commit)
    assert res["summary"]["imported"] == 2

    # Verify flags were assigned in database
    flags = db.get_flags()
    assert "yahoo:RELIANCE.NS:NSE:equity" in flags
    assert flags["yahoo:RELIANCE.NS:NSE:equity"]["color"] == "red"
    assert "yahoo:TCS.NS:NSE:equity" in flags
    assert flags["yahoo:TCS.NS:NSE:equity"]["color"] == "blue"

    # Test conflict rule: existing flag is never overwritten silently by CSV
    db.set_flag("yahoo:RELIANCE.NS:NSE:equity", "yellow", "RELIANCE-EQ", "Reliance", "NSE", "yahoo", "equity")
    commit2 = Commit(
        content=csv_content,
        preview_hash=preview["preview_hash"],
        name="Imported 2",
        mode="append",
        revision=res["watchlist_revision"]
    )
    res2 = service.commit(commit2)
    # RELIANCE must still be yellow, not reverted to red!
    flags_after = db.get_flags()
    assert flags_after["yahoo:RELIANCE.NS:NSE:equity"]["color"] == "yellow"

def test_workspace_model_validation_and_put_with_color_watchlist(tmp_path):
    """Verify that active_watchlist can be any valid color list (e.g. 'color:red') without 422 rejection."""
    app = create_app(data_dir=str(tmp_path), token="test_token_at_least_32_characters_long_12345")
    client = TestClient(app)
    headers = {"Authorization": "Bearer test_token_at_least_32_characters_long_12345"}

    # Fetch initial workspace
    ws_resp = client.get("/workspace", headers=headers)
    assert ws_resp.status_code == 200
    workspace = ws_resp.json()

    # Set active_watchlist to 'color:red'
    workspace["active_watchlist"] = "color:red"

    # PUT /workspace must succeed (HTTP 200, NOT 422!)
    put_resp = client.put("/workspace", headers=headers, json=workspace)
    assert put_resp.status_code == 200, f"Failed: {put_resp.text}"

    # Verify GET /workspace retains 'color:red'
    restored = client.get("/workspace", headers=headers).json()
    assert restored["active_watchlist"] == "color:red"

    # Verify invalid color in active_watchlist fails with 422
    workspace["active_watchlist"] = "color:invalid_color_name"
    fail_resp = client.put("/workspace", headers=headers, json=workspace)
    assert fail_resp.status_code == 422

def test_watchlist_refresh_quotes_for_colored_watchlist(tmp_path):
    """Verify that colored watchlists resolve symbols for quote retrieval and status endpoints."""
    app = create_app(data_dir=str(tmp_path), token="test_token_at_least_32_characters_long_12345")
    client = TestClient(app)
    headers = {"Authorization": "Bearer test_token_at_least_32_characters_long_12345"}
    db = app.state.db

    # Flag INFY as red
    db.set_flag(
        canonical_id="yahoo:INFY.NS:NSE:equity",
        color="red",
        symbol="INFY-EQ",
        name="Infosys Limited",
        exchange="NSE",
        provider="yahoo",
        kind="equity"
    )

    # Status endpoint for 'color:red' must succeed (200, NOT 404!)
    status_resp = client.get("/api/quotes/status?watchlist=color%3Ared", headers=headers)
    assert status_resp.status_code == 200
    data = status_resp.json()
    assert data["watchlist"] == "color:red"
    assert "yahoo:INFY.NS:NSE:equity" in data["rows"]
    assert data["rows"]["yahoo:INFY.NS:NSE:equity"]["state"] == "idle"

    # Unknown color must return 404
    bad_resp = client.get("/api/quotes/status?watchlist=color%3Anonexistent", headers=headers)
    assert bad_resp.status_code == 404

