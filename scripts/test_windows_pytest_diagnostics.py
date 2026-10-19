"""Observer tests use synthetic failures only; no application/profile is launched."""
import json
from pathlib import Path
import sqlite3
from types import SimpleNamespace
import unittest
import pytest
import windows_pytest_diagnostics as d


class DiagnosticTests(unittest.TestCase):
    def test_catalog_source_binding(self):
        files, names = d.sources(d.ROOT)
        catalog = json.loads(d.CATALOG.read_text())
        self.assertEqual(files, catalog['files'])
        self.assertFalse(set(catalog['nodes']) - names)
        self.assertEqual(catalog['checkpoints'], d.assertion_checkpoints(d.ROOT))
        self.assertEqual(set(catalog['checkpoints']), d.CHECKPOINT_TESTS)

    def test_checkpoint_comes_from_source_frame_not_exception_text(self):
        catalog = json.loads(d.CATALOG.read_text())
        node = 'backend/tests/test_windows_platform.py::test_private_profile_directory'
        row = d.identity(node, catalog)
        checkpoint = catalog['checkpoints'][node][0]
        frame = SimpleNamespace(path=d.ROOT / node.split('::')[0], lineno=checkpoint['line'] - 1)
        info = SimpleNamespace(value=AssertionError('PRIVATE_SENTINEL'), traceback=[frame])
        self.assertEqual(d.failure_checkpoint(info, row, catalog), checkpoint['code'])
        info.traceback = [SimpleNamespace(path=d.ROOT / 'unreviewed.py', lineno=frame.lineno)]
        self.assertIsNone(d.failure_checkpoint(info, row, catalog))
        info.traceback = [frame, SimpleNamespace(path=d.ROOT / 'unreviewed.py', lineno=frame.lineno)]
        self.assertIsNone(d.failure_checkpoint(info, row, catalog))
        info.traceback = [SimpleNamespace(path=frame.path, lineno=0)]
        info.value = AssertionError(checkpoint['code'])
        self.assertIsNone(d.failure_checkpoint(info, row, catalog))
        info.traceback = [frame]; info.value = ValueError(checkpoint['code'])
        self.assertIsNone(d.failure_checkpoint(info, row, catalog))
        info.value = AssertionError('PRIVATE_SENTINEL'); info.errisinstance = lambda cls: False
        observer = d.Observer(catalog)
        observer.pytest_runtest_makereport(SimpleNamespace(nodeid=node), SimpleNamespace(when='setup', excinfo=info))
        self.assertIsNone(observer.result(1)['failures'][0]['checkpoint'])

    def test_independent_directory_reference_rejects_invalid_or_incomplete_input(self):
        import importlib.util
        import shutil
        import tempfile
        from unittest.mock import patch
        spec = importlib.util.spec_from_file_location('directory_reference', d.ROOT / 'backend/tests/directory_reference.py')
        reference = importlib.util.module_from_spec(spec); spec.loader.exec_module(reference)
        original = reference.official_reference()
        self.assertGreaterEqual(len(original['MAINBOARD']), 1000)
        self.assertGreaterEqual(len(original['SME']), 100)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name in ['EQUITY_L.csv', 'SME_EQUITY_L.csv']:
                shutil.copyfile(reference.RESOURCES / name, root / name)
            # Mutate the actual supplied input, never publish a fabricated official snapshot.
            path = root / 'EQUITY_L.csv'; text = path.read_text()
            import csv, io
            records = list(csv.reader(io.StringIO(text)))
            index = next(i for i, value in enumerate(records[0]) if 'ISIN' in value)
            records[1][index] = 'INVALID'
            out = io.StringIO(); csv.writer(out).writerows(records); path.write_text(out.getvalue())
            with patch.object(reference, 'RESOURCES', root):
                with self.assertRaises(ValueError): reference.official_reference()
                path.write_text('\n'.join(text.splitlines()[:5]) + '\n')
                with self.assertRaises(ValueError): reference.official_reference()

    def test_identity_allowlist(self):
        catalog = json.loads(d.CATALOG.read_text())
        node = 'backend/tests/test_windows_platform.py::test_private_profile_directory'
        self.assertEqual(d.identity(node, catalog)['node_id'], node)
        self.assertIsNone(d.identity(node + '[SECRET]', catalog))
        self.assertIsNone(d.identity('/Users/private/test_secret.py::test_secret', catalog))

    def test_classification(self):
        for exc, kind, code in [
            (ValueError('the environment variable is longer than 32767 characters'), 'ValueError', 'ENV_VAR_LENGTH_LIMIT'),
            (ValueError('PRIVATE_SENTINEL'), 'ValueError', 'OTHER_FAILURE'),
            (PermissionError('PRIVATE_SENTINEL'), 'PermissionError', 'ACCESS_DENIED'),
            (FileNotFoundError('PRIVATE_SENTINEL'), 'FileNotFoundError', 'FILE_NOT_FOUND'),
            (sqlite3.OperationalError('PRIVATE_SENTINEL'), 'OperationalError', 'SQLITE_OPERATIONAL_ERROR'),
            (AssertionError('PRIVATE_SENTINEL'), 'AssertionError', 'ASSERTION_FAILED')]:
            self.assertEqual(d.classify(exc), (kind, code))
        class SecretError(Exception):
            def __str__(self): raise RuntimeError('must not stringify')
        self.assertEqual(d.classify(SecretError()), ('UNKNOWN', 'OTHER_FAILURE'))

    def test_environment_flags_utf16(self):
        flags = d.env_flags({'PATH': 'x'*32767, 'SECRET': 'private'})
        self.assertTrue(flags['path_over_limit'])
        self.assertTrue(flags['any_value_over_limit'])
        self.assertFalse(flags['pytest_current_test_over_limit'])
        self.assertTrue(d.env_flags({'SECRET': '\U0001f600'*16384})['any_value_over_limit'])
        self.assertNotIn('private', json.dumps(flags))

    def test_caps_and_unknown_identifiers(self):
        node = 'backend/tests/test_windows_platform.py::test_private_profile_directory'
        catalog = json.loads(d.CATALOG.read_text()); observer = d.Observer(catalog)
        info = SimpleNamespace(value=AssertionError('PRIVATE_SENTINEL'), errisinstance=lambda cls: False)
        call = SimpleNamespace(when='call', excinfo=info)
        for _ in range(33): observer.pytest_runtest_makereport(SimpleNamespace(nodeid=node), call)
        observer.pytest_runtest_makereport(SimpleNamespace(nodeid=node+'[SECRET]'), call)
        result = observer.result(1)
        self.assertEqual(len(result['failures']), 32)
        self.assertEqual(result['omitted_failures'], 1)
        self.assertEqual(result['rejected_identifiers'], 1)
        self.assertNotIn('PRIVATE_SENTINEL', json.dumps(result))
        self.assertNotIn('[SECRET]', json.dumps(result))

    def test_internal_error_flag(self):
        observer = d.Observer({'nodes': {}})
        observer.pytest_internalerror(None, None)
        self.assertEqual(observer.result(3)['status'], 'INTERNAL_ERROR')


if __name__ == '__main__':
    unittest.main()
