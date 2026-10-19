import io
import json
import os
from pathlib import Path
from types import SimpleNamespace
import pytest
from app.parent_lifetime import watch_parent
from app.profile_paths import default_profile
from app.profile_security import secure_profile


@pytest.mark.parametrize('home,appdata',[(r'C:\Users\Name With Spaces',r'C:\Users\Name With Spaces\AppData\Roaming'),(r'D:\用户',r'D:\用户\AppData\Roaming')])
def test_windows_profile_names(home,appdata):
    assert str(default_profile('win32',{'APPDATA':appdata},home)).endswith('GLOBAL MARKET TERMINAL')
    assert str(default_profile('win32',{'APPDATA':appdata},home)).startswith(appdata)
    assert 'Library/Application Support' not in str(default_profile('win32',{'APPDATA':appdata},home))


def test_mac_profile_unchanged(tmp_path):
    assert default_profile('darwin',{},tmp_path)==tmp_path/'Library/Application Support/GLOBAL MARKET TERMINAL'


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
    if os.name=='nt':
        import re
        from app.profile_security import windows_dacl,windows_user_sid
        for p in [path,child]:
            dacl=windows_dacl(p);trustees=re.findall(r'\(A;[^)]*;;;([^;)]+)\)',dacl)
            assert trustees, 'PROFILE_DACL_PRESENT'
            from windows_acl_reference import inspect_private_dacl
            if p == path:
                audit = inspect_private_dacl(p, 'profile_directory')
                assert audit != 'API_INCONCLUSIVE', 'PROFILE_DIR_API_INCONCLUSIVE'
                assert audit != 'MISSING_DACL', 'PROFILE_DIR_MISSING_DACL'
                assert audit != 'SPECIAL_ACE', 'PROFILE_DIR_SPECIAL_ACE'
                assert audit != 'UNEXPECTED_INHERITED', 'PROFILE_DIR_UNEXPECTED_INHERITED'
                assert audit != 'UNEXPECTED_ALLOW', 'PROFILE_DIR_UNEXPECTED_ALLOW'
                assert audit != 'PROTECTION_MISMATCH', 'PROFILE_DIR_PROTECTION_MISMATCH'
                assert audit != 'INHERITANCE_MISMATCH', 'PROFILE_DIR_INHERITANCE_MISMATCH'
                assert audit != 'RIGHTS_MISMATCH', 'PROFILE_DIR_RIGHTS_MISMATCH'
                if audit == 'EQUIVALENT_SID':
                    # Diagnostic only: retain the exact original trustee restriction.
                    assert set(trustees)<={'SY','BA',windows_user_sid()}, 'PROFILE_DIR_EQUIVALENT_SID'
                else:
                    assert set(trustees)<={'SY','BA',windows_user_sid()}, 'PROFILE_DACL_TRUSTEES'
            else:
                audit = inspect_private_dacl(p, 'profile_child')
                assert audit != 'API_INCONCLUSIVE', 'PROFILE_CHILD_API_INCONCLUSIVE'
                assert audit != 'MISSING_DACL', 'PROFILE_CHILD_MISSING_DACL'
                assert audit != 'SPECIAL_ACE', 'PROFILE_CHILD_SPECIAL_ACE'
                assert audit != 'UNEXPECTED_INHERITED', 'PROFILE_CHILD_UNEXPECTED_INHERITED'
                assert audit != 'UNEXPECTED_ALLOW', 'PROFILE_CHILD_UNEXPECTED_ALLOW'
                assert audit != 'PROTECTION_MISMATCH', 'PROFILE_CHILD_PROTECTION_MISMATCH'
                assert audit != 'INHERITANCE_MISMATCH', 'PROFILE_CHILD_INHERITANCE_MISMATCH'
                assert audit != 'RIGHTS_MISMATCH', 'PROFILE_CHILD_RIGHTS_MISMATCH'
                if audit == 'EQUIVALENT_SID':
                    assert set(trustees)<={'SY','BA',windows_user_sid()}, 'PROFILE_CHILD_EQUIVALENT_SID'
                else:
                    assert set(trustees)<={'SY','BA',windows_user_sid()}, 'PROFILE_CHILD_DACL_TRUSTEES'
    else:
        assert path.stat().st_mode&0o777==0o700, 'PROFILE_POSIX_MODE'
