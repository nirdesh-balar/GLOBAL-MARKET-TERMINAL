# Portable custom reporter startup

Review parent: e9931aec640af528f2d78c9f0de86dc7442e2362. This local patch does not authorize a push, Windows workflow dispatch or release.

## Evidence and scope

Windows run 39212697754 recorded privacy_tests child/wrapper exit 7, no structured summary, null counts and INFRASTRUCTURE / REPORT_UNAVAILABLE. Reporting preflight, application Python and downstream builds did not execute. Its reporter child's raw stderr was runner-local and was not uploaded. The historical exception and any failing subtest remain unknown.

Node 22.19.0's internal/test_runner/utils imports custom reporter names using its ESM loader. The default loader rejects unsupported URL schemes. A raw Windows drive path can be parsed as a drive-letter scheme; the portable module specifier is a file URL. The launcher now constructs the fixed original reporter argument with:

```js
pathToFileURL(resolve(ROOT, 'scripts/windows-ci-preflight-reporter.mjs')).href
```

The original reporter module, test file selection, subprocess executable, shell:false, source validation, full Python suite, workflow, pinned runtimes, locks, application code and four-file upload boundary are unchanged. Node's URL API encodes spaces, Unicode and URL-significant characters. Windows-path conversion and rejection checks on a Mac are not native Windows validation.

## Bounded bootstrap evidence

If a child has an actual nonzero exit, no spawn error and empty/whitespace stdout, the existing unavailable report records INFRASTRUCTURE / REPORTER_NO_OUTPUT. This states only the absence of reporter output. It does not assert a module-loading exception, a failing test or a specific root cause. No stderr parsing, stack parsing, code extraction, environment capture or arbitrary text copying is used.

Original nonzero exits, including 7 when genuinely returned, remain unchanged. Missing launch status, malformed/oversized JSON or other unusable evidence retains REPORT_UNAVAILABLE. Original exit zero with unusable evidence still fails the wrapper with exit 1. Null counts and withheld identifiers cannot become a passing release decision. Schema v3 admits the single new fixed code only with UNAVAILABLE status, INFRASTRUCTURE phase, a withheld identifier and a recorded nonzero exit. All other schema, canonical rendering, integrity and size rules remain in force.

## Local regression coverage

- Exact production file URL and unchanged reporter target; drive-letter conversion and raw-specifier rejection; macOS conversion; spaces, Unicode, percent and hash encoding.
- Real Node loading of the original custom reporter from a disposable directory with spaces and Unicode.
- Missing and throwing reporters, an explicit exit-7 child, and malformed reporter output after Node exits zero. Direct child and wrapper exit statuses must agree for failures.
- No sentinels, credentials, runtime paths, stacks or raw stderr in public output; bootstrap evidence independently verifies as exactly four bounded canonical files and remains BLOCKED.
- Existing assertion/setup/teardown distinctions, source binding, privacy tests and full diagnostic preflight test selection remain intact, without skips.

Local results and commit/tree/diff hashes are recorded in the separate private review report. Real Windows execution requires separate approval for the reviewed commit and one workflow run. No Windows success is inferred from these Mac checks.
