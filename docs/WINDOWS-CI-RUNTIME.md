# Windows CI runtime and failure reporting review

Reviewed 2026-10-19 against published base `f98fe38032949b3632868df50714f3ead0157545`.
This patch is infrastructure only. It does not establish Windows release acceptance.

## Runtime choice

Use **standard CPython 3.13.16, Windows x64**, with the existing SHA-pinned
`actions/setup-python` action, exact version and `check-latest: false`.
Setup and packaging both reject a different patch version, 32-bit interpreter,
non-Windows interpreter or free-threaded build. An old virtual environment must
not silently supply the frozen application's interpreter.

The official [Actions Python manifest](https://github.com/actions/python-versions/blob/main/versions-manifest.json)
has no Windows x64 asset for 3.11.13 or security release 3.11.17. Python 3.12.15
is also source-only. Falling back to 3.11.9 would omit subsequent security fixes.
A custom 3.11 build adds a separate toolchain, provenance and maintenance burden.
3.13.16 is the smallest currently maintained series with an available official
Windows binary identified in this review; 3.14 introduces another minor-version
change and is unnecessary here. PyInstaller 6.19.0 declares Python >=3.8,<3.15,
so choosing the new 3.15 series would violate the existing lock.

Python's [3.13.16 release](https://www.python.org/downloads/release/python-31316/)
contains security fixes and updated bundled OpenSSL/Expat. It remains a security
maintenance series; future security releases must be reviewed rather than
silently replaced with an older binary.

Verified provenance:

- Actions release: [3.13.16-36805956071](https://github.com/actions/python-versions/releases/tag/3.13.16-36805956071).
- Asset: `python-3.13.16-win32-x64.zip` (standard, not freethreaded).
- Asset SHA-256: `80566a71bdc2f5e446daceb1c832e0f52d56cee8ff0e40de1d54131d5c68c487`.
- Asset downloaded with TLS verification, SHA-256 matched GitHub's release digest, ZIP CRC checked.
- Enclosed `python-3.13.16-amd64.exe` SHA-256:
  `fb4f9f5d438b2396da0086dc70b935c530cb578e37adc6d354f7ad2037fee83b`, matching Python.org.
- Reviewed manifest SHA-256: `3bffef7a0fddc945a17a5bb7b924462746844f4a39f7fdd57a318add7df13b21`.

This is an exact runtime-version pin using the trusted Actions installer/cache.
The independent asset digest review above is not a claim that setup-python
rechecks that digest for a preinstalled runner cache, or that the complete NSIS
build is bit-for-bit reproducible.

## Unchanged dependency lock

Official PyPI version metadata was checked for all **53 Windows-selected pins**:
all allow Python 3.13.16 and have a compatible Windows AMD64 or universal wheel.
The 65 active dependency edges satisfy the unchanged pinned versions after
evaluating Windows/Python 3.13 environment markers. macOS-only macholib is excluded;
Windows colorama, pefile and pywin32-ctypes are included.

A Windows-targeted pip dry run also resolved wheels without installation. Because
pip evaluates dependency platform markers on its executing host, that macOS dry
run additionally selected macholib. The explicit Windows marker/constraint check
above is the 53-package result; the dry run is not a native Windows pip execution.

Native-compatible wheels include numpy 2.4.2, pandas 3.0.1, pydantic_core 2.41.5,
cffi 2.1.1, curl_cffi 0.16.3, lxml 6.1.3, protobuf 7.36.2 and websockets 15.0.1.
PyInstaller 6.19.0 supplies `py3-none-win_amd64` and declares Python 3.13 support.
The application source has no imports of the Python 3.13 removed standard-library
modules checked during this review. Neither Python nor npm package locks changed.

Metadata compatibility is not actual execution. The next approved native Windows
run must still install the lock, run pip check and the full Python tests, freeze
the backend, start that frozen executable, then build and exercise Electron/NSIS.
These remain mandatory and fail the job if unsuccessful.

Security finding: official PyPI metadata for the existing pytest 9.0.2 reports
CVE-2025-71176 / GHSA-6w46-j5rx-g56g (Unix temporary-directory handling, fixed in
9.0.3). This does not describe the Windows runner's temporary-directory mechanism.
The lock is preserved in this focused patch; a separate dependency-security
review is still needed for Unix test environments. Absence of other advisories in
these responses is not a guarantee that every dependency is vulnerability-free.

## Failure evidence

Each mandatory workflow step has a stable ID. The always-run collector receives
the Actions outcomes and distinguishes INFRASTRUCTURE FAILURE, TEST FAILURE,
BUILD FAILURE and NOT EXECUTED. Missing evidence never counts as passing tests.
Missing EXE files are reported as NOT BUILT, even if partial package JSON exists.
Empty or incomplete regression collections cannot satisfy validation.

The built-ins-only command wrapper captures stdout/stderr, command, timestamps,
spawn errors and original exit status before returning failure. Raw subprocess
output remains runner-local and is not forwarded to public job logs. This also works
for npm installation, without node_modules or Python. Managed Actions such as
setup-python retain their original diagnostic in the linked Actions step log;
the collector records the failed action and original run URL, without inventing
an inline error message. A missing test-results directory cannot replace that
failure with ENOENT. Raw reports, logs, screenshots and binary manifests remain
runner-local. Only the four regenerated reports described in
[the evidence policy](WINDOWS-CI-EVIDENCE.md) may be uploaded, after strict validation.
Uploading safe failure evidence does not make the job green.

Local tests use synthetic temporary fixtures on macOS. They cover early Python
failure, absent output directories, npm and spawn failures, failed tests, partial
builds, malformed evidence, empty results, skipped stages, host isolation and
workflow security boundaries. Synthetic fixtures are not Windows test results.

Read-only permissions, exact SHA checkout/assertion, nonpersistent credentials,
SHA-pinned Actions and `--publish never` packaging remain in place. No signing
secrets, publication trigger or release creation is introduced.
