# Diagnostic preflight: local cross-platform correction

Review parent: 2c8e22d623262d11999d4d67b2142624860911fd. No push, dispatch or release is authorized by preparing this patch.

## Evidence and suspected cause

Run 39208651768 failed in reporting_tests, exit 1. Full application Python, its observer/JUnit and all downstream builds were skipped. The four retained text reports do not identify the failing Node subtest. The old synthetic integration expectation is a source-verified portability problem, **not a retrospectively confirmed assertion from that Windows run**.

The synthetic fixture retains four pytest items: a pass, a deliberate ValueError call failure, a deliberate teardown PermissionError, and a deliberate assertion failure parameterized with 40,000 characters. Pytest copies the current ID plus phase into PYTEST_CURRENT_TEST. Windows can reject that assignment during setup and teardown before the assertion runs.

| Contract | Passed items | Failed items | Errored items | Skipped | Exact failure phases |
| --- | ---: | ---: | ---: | ---: | --- |
| macOS (also Unix/Linux) | 1 | 2 | 1 | 0 | test_env call / ValueError / ENV_VAR_LENGTH_LIMIT; test_long call / AssertionError / ASSERTION_FAILED; test_teardown teardown / PermissionError / ACCESS_DENIED |
| Windows x64 expected | 1 | 1 | 2 | 0 | test_env call; test_long setup and teardown, each ValueError / ENV_VAR_LENGTH_LIMIT; test_teardown teardown / PermissionError / ACCESS_DENIED |

Both contracts require four unique items and pytest exit 1. Exact failure rows (including phase, outcome, exception and code), zero rejected/omitted IDs, secret exclusion, oversized-ID withholding, validated JSON schema and stale-source rejection are asserted. No arbitrary count ranges, skips, input truncation or weakened application assertions are used.

The Mac also runs a separate disposable-child simulation: a temporary conftest wraps only pytest's current-test-variable update and rejects the oversized update with the Windows length-limit exception. Other updates delegate to pytest unchanged. The original 40,000-character input and deliberate assertion remain. This tests the Windows observer contract without changing sys.platform, the Mac's environment or the production observer. **Simulation is not Windows execution or verification of the precise native boundary.** Native Windows cannot reach the long-ID assertion; that behavior is explicitly asserted. The macOS run verifies that the unchanged assertion executes. The real Windows branch still needs the next separately approved Windows x64 run. The actual application Python suite and its catalogue are unchanged.

## Source-validated preflight evidence

Two existing workflow commands now run the same Node test files through a small standalone launcher/custom reporter; the reporter tests additionally include its own focused regression file. No stage is bypassed and no continue-on-error is introduced. The full application pytest command remains unchanged.

The Node CLI still determines its original exit status. The launcher records that status and returns it for failures. If Node exits zero but the evidence is missing/invalid/empty/skipped, the wrapper fails closed with exit 1 and explicitly retains original exit 0. A launch failure records no invented Node exit status. A fresh exclusive intermediate under test-results is required; no historical output is deleted or reused. Child logs remain private to the runner. The launcher normalizes only its entry-point path, so macOS /var and /private/var aliases cannot silently prevent execution.

The reporter consumes structured Node test events, **not raw TAP parsing**. It ignores stdout, stderr, diagnostics, stack traces, error messages and runtime titles. The only error-message inspection is an exact comparison against Node's fixed before/beforeEach/after/afterEach hook-wrapper strings to derive SETUP or TEARDOWN; no text is copied. Unrecognized hook wrappers produce UNKNOWN.

Only fixed reviewed preflight filenames are eligible. Each failure location must point exactly to a test registration in that file. A whole-file SHA-256 binds the location to the reviewed source. During CI the producer checks the file against the SOURCE_REF Git blob. Public projection and independent verification also require the file to match the exact expected source revision's Git blob, so a runtime-edited source title cannot become public evidence. Local precommit development can collect events without SOURCE_REF; this does not disable the public projector's explicit revision check. The verifier checks filename, line, column, digest and source literal. Human-readable names are derived only from unescaped ASCII literal first arguments in the public source, never the runtime event. Computed titles retain a source location and zero-based registration occurrence, with the title explicitly withheld. Unknown locations/file-startup failures have identifier WITHHELD and no file/name/path/hash copied from runtime. There is no inference of a private identifier from a traceback. This design assumes the reviewed checkout and trusted Node runner, as do the existing artifact controls.

The independent schema rejects unknown fields, unapproved paths/names/hashes/locations, duplicate identifiers, inconsistent counts, altered nonzero exit codes, false passes and incompatible phase/code combinations. Controlled classifications:

- ASSERTION / ASSERTION_FAILED
- SETUP or TEARDOWN or UNKNOWN / HOOK_FAILED
- TEST / TEST_ERROR
- UNKNOWN / TIMEOUT or CANCELLED
- INFRASTRUCTURE / RUNNER_FAILURE or REPORT_UNAVAILABLE

Counts come from the global Node summary and distinguish pass/fail/cancel/skip/todo. Each stage retains up to eight failures; omissions are explicit. Missing summaries have null counts and UNAVAILABLE, never a fabricated pass. The source location and registration occurrence identify computed subtests even when their title cannot be safely exposed. Setup/teardown phase handling is tested with genuine Node beforeEach/afterEach failures on the Mac; file startup and assertion failures are also exercised. No runtime private paths or sentinel error contents survive these tests.

## Four-report boundary

Public schema v3 adds privacy_tests/reporting_tests evidence inside WINDOWS-VERIFICATION.json and canonical Markdown. The other two files remain INSTALLER-SHA256.txt and EVIDENCE-SHA256SUMS.txt. The exact upload paths, four-file allowlist, 65,536-byte JSON / 16,384-byte Markdown caps, checksum rules, symlink/hardlink protections and final independent guard are unchanged. Oversized or unsafe evidence prevents upload. New runner-local intermediates and child logs are never uploaded.

READY now also requires both recorded successful preflights, in addition to every existing Windows application/build gate. Wrapper exit status must agree with the existing CI stage record. Missing preflight data is explicitly NOT RECORDED and cannot produce READY. Prior v1/v2 artifacts and their checkpoint validators remain preserved; they are not silently rewritten as v3 successes.

## Verification and approval

Local checks cover both exact pytest contracts (native macOS plus labelled child simulation), observer units, Node assertion/hook/startup failure integration, source and secret rejection, canonical four-report staging/verification, original exit status, relevant Python application tests, release/platform controls and TypeScript checks. Application code, indicators, drawings, providers, dependencies, original tests/catalogue, ordinary profiles and candidate assets are preserved.

Only after separate approval: revalidate the exact new commit/parent/tree/diff/source manifest/security/protection, push a single normal fast-forward ref to main, verify GitHub's SHA, and dispatch exactly one existing windows-x64.yml run with source_ref equal to that SHA and portable=false. Keep the Windows-2022 x64 / Node 22.19.0 / standard CPython 3.13.16 pins and locked dependencies. If the run fails, retain safe evidence and stop. No binaries, release/tag, credentials or paid VM provisioning are included.

API reference: [Node 22.19.0 structured test events and custom reporters](https://nodejs.org/download/release/v22.19.0/docs/api/test.html). macOS test success and simulation do not establish Windows Server or Windows 11 acceptance.
