import io
import json
from pathlib import Path
from types import SimpleNamespace
import pytest
from app.parent_lifetime import watch_parent
from app.profile_paths import default_profile
from app.profile_security import secure_profile


def test_mac_profile_unchanged(tmp_path):
    assert default_profile(home=tmp_path)==tmp_path/'Library/Application Support/GLOBAL MARKET TERMINAL'


@pytest.mark.parametrize('messages',[
    [dict(command='shutdown',token='a'*64)],
    [dict(command='shutdown',token='wrong'),dict(command='shutdown',token='a'*64)],
    [dict(command='not_shutdown',token='a'*64),dict(command='shutdown',token='a'*64)],
    [None,[],dict(command='shutdown',token=99)],
    [],
])
def test_parent_pipe_shutdown_and_eof(monkeypatch,messages):
    monkeypatch.setenv('IMT_PARENT_PIPE','1');server=SimpleNamespace(should_exit=False)
    thread=watch_parent(server,io.StringIO(''.join(json.dumps(v)+'\n'for v in messages)),token='a'*64)
    thread.join(2);assert not thread.is_alive();assert server.should_exit


def test_unowned_standalone_process_has_no_monitor(monkeypatch):
    monkeypatch.delenv('IMT_PARENT_PIPE',raising=False)
    server=SimpleNamespace(should_exit=False)
    assert watch_parent(server,io.StringIO(''),token='a'*64)is None
    assert not server.should_exit


def test_private_profile_directory(tmp_path):
    path=tmp_path/'User name 空格';secure_profile(path)
    child=path/'private.json';child.write_text('{}')
    assert path.stat().st_mode&0o777==0o700, 'PROFILE_POSIX_MODE'
