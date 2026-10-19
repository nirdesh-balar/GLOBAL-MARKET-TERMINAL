# Windows Python: confirmed ID fix and bounded assertion investigation

Base: 617cfeae421beb6fb809fc49cacd34ee8cf005a5. Native evidence: Windows run 39224822704. Local commits require separate publication and native CI approval. No Windows results are inferred from Mac tests.

## Confirmed environment-limit obstruction

Two security/CSV tests had oversized auto-generated parameter IDs. Actual Windows setup and teardown raised ValueError / ENV_VAR_LENGTH_LIMIT. Explicit short IDs now cover the same five image and six CSV cases. Every parameter expression, full payload and test body remains unchanged. No truncation, environment modification, PYTEST_CURRENT_TEST suppression, skip or application validation change is involved. The first local commit isolates these two decorator edits and the regenerated catalogue.

The collection audit retains 2,403 cases across 461 functions. The eleven selected cases have identical ordered payload lengths/hashes and function ASTs; only their ID hashes change. The synthetic oversized observer preflight remains intact to continue checking Windows error behavior.

## Directory test contracts

CI downloads current official files while five failed tests embed historical totals 3185/2605/580. That temporal coupling is established in source; the exact failing Windows predicates and actual counts were not retained. No new transient total is substituted.

A test-only oracle independently reads the actual ignored official files using CSV column positions, without importing application parsing, registry or screener logic. It independently validates symbols, names, series and ISINs; preserves duplicate symbol/series last-occurrence semantics; and enforces the existing mainboard >=1000 / SME >=100 coverage bounds. Tests compare complete metadata maps, counts and board categories against this input oracle, including universe duplicates and stale-provider exclusion. Rejected updates must retain all records, not just the old count. The 100-item batch bound, concurrent-job rejection, cancellation state/processed/cancelled checks and oversized-batch rejection are preserved.

These are deterministic contracts for the supplied official source inputs, not fabricated snapshots. CSV inputs remain ignored and outside public source/installers. No production import or screener behavior changes.

## Profile and migration security

Production DACL/SID/ACE/inheritance code is unchanged. SYSTEM, Administrators and the actual current user remain the only allowed trustees. The test splits the existing combined predicate into presence and allowed-trustee assertions; it adds no SID or alias to the allowlist and substitutes no POSIX check on Windows. Raw DACL assertion messages are replaced by fixed checkpoint labels.

Microsoft documents SDDL trustee abbreviations and inheritance flags. Possible alias or inheritance differences remain hypotheses until native checkpoints identify the failing predicate. A Mac cannot establish native ACL acceptance. Migration target/reference/archive/settings/restore predicates are preserved. The test's read-only SQLite inspection is explicitly closed before restore: sqlite3 connection context management alone does not close a connection. This is test cleanup, not an established cause of the Windows AssertionError. Production backup/restore already closes its owned connections.

## Safe source-bound checkpoints

Only the seven reviewed failing test identities may declare assertion checkpoints. The catalogue stores literal uppercase labels and non-overlapping AST assertion line ranges, bound to tracked test file hashes. The observer selects a label from the actual failing traceback frame's approved file/line. It never reads assertion text or exports frame paths, ACLs, SIDs, values or stack traces. A matching error message at an unreviewed source location cannot nominate a label. Unknown/non-assertion failures get null checkpoint.

Python observer/catalogue schema v2 adds a nullable checkpoint per failure. The public Windows evidence stays schema v3. The strict projector accepts existing v1 diagnostics and validates v2 checkpoint identity against the reviewed per-test catalogue, exception type, phase and category. Canonical Markdown uses only the allowlisted label. Existing runtime, node hash, count, phase, cap, omission and original-exit checks remain.

The full application suite and original exit status are preserved. Missing diagnostics cannot pass. Exactly four sanitized reports and existing size limits remain enforced; raw logs/binaries are not uploaded. New unit/integration tests cover real pytest rewritten assertions, forged/mismatched labels, unreviewed frames, source/catalogue drift, independent oracle rejection and canonical four-file staging.

## References

- [Microsoft SID strings](https://learn.microsoft.com/en-us/windows/win32/secauthz/sid-strings)
- [Microsoft ACE inheritance rules](https://learn.microsoft.com/en-us/windows/win32/secauthz/ace-inheritance-rules)
- [Python 3.13 sqlite3 connection context management](https://docs.python.org/3.13/library/sqlite3.html#how-to-use-the-connection-context-manager)

Final local results, exact commit/tree/diff hashes and protection audits are in the separate private review report. Public main must remain unchanged until explicit approval, and one separately approved native Windows run must still establish whether the remaining assertions pass or identify a checkpoint. Official v1.0.0 remains unpublished.
