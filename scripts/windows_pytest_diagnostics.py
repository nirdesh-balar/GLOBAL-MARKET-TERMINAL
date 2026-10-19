"""Passive pytest observer. Raw results stay local; no test IDs or behavior are changed."""
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'scripts/windows-pytest-nodes.json'
EXCEPTIONS = {'AssertionError', 'ValueError', 'TypeError', 'RuntimeError', 'OSError',
              'PermissionError', 'FileNotFoundError', 'TimeoutError', 'UnicodeEncodeError',
              'UnicodeDecodeError', 'OperationalError', 'IntegrityError', 'ImportError',
              'ModuleNotFoundError', 'KeyError', 'IndexError'}
BASE = re.compile(r'backend/tests/test_[a-zA-Z0-9_]+\.py::(?:Test[a-zA-Z0-9_]+::)?test_[a-zA-Z0-9_]+\Z')


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def sources(root):
    """Only tracked, non-link test modules; AST identifiers, never executed data."""
    paths = subprocess.check_output(['git', 'ls-files', '-z', 'backend/tests/*.py'], cwd=root).decode().split('\0')
    files, names = {}, set()
    for name in filter(None, paths):
        path = root / name
        if path.is_symlink() or path.resolve().parent != (root / 'backend/tests').resolve():
            raise ValueError('Invalid tracked test source')
        data = path.read_bytes()
        files[name] = hashlib.sha256(data).hexdigest()
        tree = ast.parse(data)
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith('test_'):
                names.add(name + '::' + node.name)
            if isinstance(node, ast.ClassDef) and node.name.startswith('Test'):
                for fn in node.body:
                    if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)) and fn.name.startswith('test_'):
                        names.add(name + '::' + node.name + '::' + fn.name)
    if not names or any(not BASE.fullmatch(n) for n in names):
        raise ValueError('Invalid public test names')
    return files, names


def identity(node, catalog):
    base = node.split('[', 1)[0]
    hashes = catalog['nodes'].get(base, [])
    key = digest(node)
    if not BASE.fullmatch(base) or key not in hashes:
        return None
    return dict(test=base, case_index=hashes.index(key), node_sha256=key,
                node_id=node if len(node) <= 512 and node.isascii() and not any(ord(c) < 32 for c in node) else None)


def classify(exc):
    # Do not stringify unknown exceptions; their __str__ can expose arbitrary content.
    kind = type(exc).__name__ if type(exc).__module__ in {'builtins', 'sqlite3'} and type(exc).__name__ in EXCEPTIONS else 'UNKNOWN'
    code = 'OTHER_FAILURE'
    if type(exc) is ValueError and exc.args == ('the environment variable is longer than 32767 characters',):
        code = 'ENV_VAR_LENGTH_LIMIT'
    elif isinstance(exc, PermissionError):
        code = 'ACCESS_DENIED'
    elif isinstance(exc, FileNotFoundError):
        code = 'FILE_NOT_FOUND'
    elif isinstance(exc, OSError) and getattr(exc, 'winerror', None) in {32, 33}:
        code = 'FILE_LOCKED'
    elif kind in {'UnicodeEncodeError', 'UnicodeDecodeError'}:
        code = 'ENCODING_ERROR'
    elif kind == 'OperationalError' and type(exc).__module__ == 'sqlite3':
        code = 'SQLITE_OPERATIONAL_ERROR'
    elif kind == 'AssertionError':
        code = 'ASSERTION_FAILED'
    return kind, code


def env_flags(environ=None):
    e = os.environ if environ is None else environ
    # Flags only, never variable names, values, lengths or paths.
    return dict(any_value_over_limit=any(len(v.encode('utf-16-le', errors='surrogatepass')) // 2 >= 32767 for v in e.values()),
                path_over_limit=len(e.get('PATH', '').encode('utf-16-le', errors='surrogatepass')) // 2 >= 32767,
                pytest_current_test_over_limit=len(e.get('PYTEST_CURRENT_TEST', '').encode('utf-16-le', errors='surrogatepass')) // 2 >= 32767,
                current_test_assignment_over_limit=False)


class Observer:
    def __init__(self, catalog):
        self.catalog, self.rows, self.outcomes = catalog, [], {}
        self.rejected = self.omitted = 0
        self.env = env_flags()
        self.internal = False

    def pytest_runtest_makereport(self, item, call):
        # Observer only: pytest still produces its normal reports and original exit status.
        outcome = 'error' if call.when != 'call' and call.excinfo else 'failed' if call.excinfo else 'passed'
        if call.excinfo and call.excinfo.errisinstance(__import__('pytest').skip.Exception):
            outcome = 'skipped'
        previous = self.outcomes.get(item.nodeid)
        rank = {'passed': 0, 'skipped': 1, 'failed': 2, 'error': 3}
        if call.when == 'call' or outcome != 'passed':
            if previous is None or rank[outcome] > rank[previous]:
                self.outcomes[item.nodeid] = outcome
        if outcome in {'failed', 'error'}:
            self.env['current_test_assignment_over_limit'] |= len((item.nodeid + ' (' + call.when + ')').encode('utf-16-le', errors='surrogatepass')) // 2 >= 32767
            row = identity(item.nodeid, self.catalog)
            if row is None:
                self.rejected += 1
                return
            if len(self.rows) >= 32:
                self.omitted += 1
                return
            kind, code = classify(call.excinfo.value)
            self.rows.append(dict(**row, phase=call.when, outcome=outcome, exception=kind, code=code))
            flags = env_flags()
            self.env = {k: self.env[k] or flags[k] for k in flags}

    def pytest_internalerror(self, excrepr, excinfo):
        self.internal = True

    def result(self, exit_code):
        win = sys.getwindowsversion() if sys.platform == 'win32' else None
        return dict(schema_version=1, status='INTERNAL_ERROR' if self.internal else 'RECORDED',
                    runtime=dict(platform=sys.platform, architecture='x64' if struct.calcsize('P') == 8 and __import__('platform').machine().lower() in {'amd64', 'x86_64'} else 'arm64' if struct.calcsize('P') == 8 else 'ia32',
                                 python='.'.join(map(str, sys.version_info[:3])),
                                 windows_version=f'{win.major}.{win.minor}.{win.build}' if win else None),
                    exit_code=int(exit_code), counts={k: list(self.outcomes.values()).count(k) for k in ('passed', 'failed', 'error', 'skipped')},
                    rejected_identifiers=self.rejected, omitted_failures=self.omitted,
                    environment=self.env, failures=self.rows)


def main():
    import pytest
    files, names = sources(ROOT)
    if sys.argv[1:] == ['--catalog']:
        nodes = {}
        class Collection:
            def pytest_collection_finish(self, session):
                for item in session.items:
                    base = item.nodeid.split('[', 1)[0]
                    if base not in names:
                        raise ValueError('Collected test absent from tracked AST')
                    nodes.setdefault(base, []).append(digest(item.nodeid))
        code = pytest.main(['backend/tests', '--collect-only', '-q'], plugins=[Collection()])
        if code:
            return int(code)
        if any(len(v) != len(set(v)) for v in nodes.values()):
            raise ValueError('Duplicate public node ID')
        CATALOG.write_text(json.dumps(dict(schema_version=1, files=files, nodes=nodes), sort_keys=True, separators=(',', ':')) + '\n', encoding='ascii')
        return 0
    catalog = json.loads(CATALOG.read_text(encoding='ascii'))
    if catalog['files'] != files or set(catalog['nodes']) - names:
        raise ValueError('Reviewed test catalogue differs from tracked sources')
    observer = Observer(catalog)
    code = pytest.main(sys.argv[1:], plugins=[observer])
    out = ROOT / 'test-results/windows-python-diagnostics.json'
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(observer.result(code), ensure_ascii=True), encoding='ascii')
    return int(code)


if __name__ == '__main__':
    sys.exit(main())
