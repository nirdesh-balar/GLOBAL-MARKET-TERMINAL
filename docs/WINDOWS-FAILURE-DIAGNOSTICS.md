# Windows diagnostics controlled from macOS

This patch is for local review. Publication and a new workflow dispatch need explicit owner approval for the new exact source SHA. No application logic, test inputs, dependency pins, test IDs, assertions or test selection changes.

## Existing evidence and its limits

Run 39199645034, source e36aa63f398fb5ae977ee682c37de07cbd5578ca, reached full Python execution on Windows Server 2022 x64 with standard CPython 3.13.16. The retained four-report artifact has 2,405 JUnit cases, **7 failures, 4 errors, 0 skips**. That implies 2,394 cases without failure/error/skip, not a verified unique pytest-item pass count. The later request's 8-failure/2,393-pass figures disagree with this retained evidence. Failed IDs and original assertions were not retained off-runner. The environment-length exception supplied in the request is a clue, not a retrospective verified classification for any particular test.

Electron, TypeScript, frozen backend, the 49 regressions, NSIS, controls/scaling and packaged-provider/installer tests were skipped after Python failed. No Windows EXE was built.

## Passive observer and public boundary

The existing Windows Python command now invokes `scripts/windows_pytest_diagnostics.py`, which calls the same `pytest.main` arguments and returns its original exit status. Its observer records failures/errors without changing reports, fixtures, environment, IDs or outcomes. Normal JUnit generation remains enabled. Output and ordinary traces still go exclusively to the existing runner-local stage log.

The observer creates one **runner-local** JSON intermediate in `test-results`. Public preparation reads that exact bounded path through the existing non-link/hardlink safeguards. No new artifact member is permitted. The only upload remains:

- WINDOWS-VERIFICATION.json
- WINDOWS-VERIFICATION.md
- INSTALLER-SHA256.txt
- EVIDENCE-SHA256SUMS.txt

The first two reports use schema version 2 with a strict `python_diagnostics` object (or null/NOT RECORDED if pytest never produced it). The same canonical render, size caps, schema guard and checksums apply. Unknown keys, unknown codes, raw messages, arbitrary exception names, paths and environment fields fail the upload guard. A missing diagnostic prevents READY; contradictory exit/pass information is rejected. READY additionally requires actual Windows x64 CPython 3.13.16 observer evidence and matching successful unique-item/JUnit counts. Older private aggregate summaries can still be projected as BLOCKED v2 evidence. Existing v1 artifacts and their original checkpoint validator remain preserved.

`scripts/windows-pytest-nodes.json` is a reviewable collection catalogue: 2,403 node SHA-256 hashes grouped under 461 AST-validated public test functions, plus SHA-256 of the tracked test sources. It contains no parameter values, environment data or test outputs. Generate it locally with the pinned environment using `python scripts/windows_pytest_diagnostics.py --catalog`; review before committing. Generation collects tests only, requires tracked AST functions, and rejects duplicate IDs. Normal CI execution checks source hashes against the reviewed catalogue and never regenerates it. Source changes require separate catalogue review.

Public preparation independently validates each failure against that catalogue. A node ID is published only when its digest matches its reviewed function and zero-based case index, it is ASCII without controls, and it fits 512 characters. Oversized/non-ASCII IDs retain the public function, exact node digest and case index, with a null ID. Unknown IDs are withheld and counted. No complete long parameter value is printed. The public Markdown renders IDs as escaped code. Up to 32 phase failures are retained; additional failures and unknown IDs are explicitly counted. If the report exceeds the unchanged size limit, upload fails safely.

Safe diagnostics include setup/call/teardown, failure versus error, allowlisted exception class, controlled code, actual runtime version/architecture/platform, unique item outcome counts, original pytest exit code, and boolean environment-limit flags. Unique outcome priority is error > failure > skip > pass; an item that passes its call but errors during teardown counts as one error. JUnit can count its call and teardown separately. Environment flags do not contain names/values/lengths; only PATH and PYTEST_CURRENT_TEST have fixed named booleans. An attempted oversized PYTEST_CURRENT_TEST assignment is flagged independently because the rejected value might never enter the environment.

Codes: ENV_VAR_LENGTH_LIMIT (exact built-in ValueError text match), ASSERTION_FAILED, ACCESS_DENIED, FILE_NOT_FOUND, FILE_LOCKED (Windows error 32/33), ENCODING_ERROR, SQLITE_OPERATIONAL_ERROR, OTHER_FAILURE. These classify observations, not root causes. Unknown exceptions are UNKNOWN and are never stringified.

If an oversized or unrecognized ID needs deeper diagnosis, first use the validated function/case/digest and public source locally. If still insufficient, obtain separate approval for encrypted owner-controlled private storage with retention/access policy. Never add raw logs or JUnit to public artifacts as a workaround.

## Verified local hazard; no speculative fix

Local collection on the unchanged test suite produces these ID lengths:

| Public function | ID characters | Why investigate |
| --- | ---: | --- |
| backend/tests/test_drawing_stage3.py::test_image_rejects_remote_executable_or_oversized_data | 175117 | Generated oversized-image parameter appears in auto ID |
| backend/tests/test_watchlists.py::test_bounded_csv_parser | 1000068 | Generated oversized-CSV parameter appears in auto ID |

Pytest 9.0.2 `_pytest.runner._update_current_test_var` assigns `item.nodeid + ' (phase)'` to `os.environ['PYTEST_CURRENT_TEST']` during setup and teardown. Both lengths exceed Windows' documented 32,767-character variable limit. That is a verified source-level compatibility hazard. It has **not** established which IDs produced the prior Windows errors or explained the seven recorded failures. Do not label these functions as the prior run's failed IDs.

If the newly approved Windows run confirms this cause, the smallest proposed follow-up is explicit short parameter `ids=` for these existing cases, keeping the original oversized data and every assertion. That fix is intentionally absent from this diagnostic patch. Do not truncate PATH, replace global environment values, skip tests, change fixture data, or assume all failures share a cause.

Other investigation targets, pending actual failed IDs:

| Concern | Public source to inspect | Evidence still needed |
| --- | --- | --- |
| Unicode/separators/case | backend/app/profile_paths.py; backend/tests/test_windows_platform.py | Actual failed identity and controlled exception/code |
| DACL/permissions/ctypes | backend/app/profile_security.py | Windows-specific error and native SID/DACL assertion, reviewed privately if needed |
| File locking/cleanup | backend/app/preview_seed.py; backend/app/crypto_migration.py | Lock-related error at exact test phase |
| SQLite isolation | backend/app/database.py; temporary-profile fixtures in backend/tests/test_direct_history.py | Actual SQLite failure and cleanup timing; connections already close in finally |
| Subprocess/PATH/temp environment | scripts/windows-ci-run.mjs; scripts/setup-windows.mjs | Boolean length flags and failed stage; wrapper inherits environment without extending PATH |
| Python 3.13 | pinned dependency/runtime setup and failed public test function | Actual Windows exception; macOS Python 3.11 success is not 3.13 acceptance |

No global Mac environment values or normal application profiles are modified by this plan.

## Next Windows run, after approval only

Publish only the separately reviewed exact commit by a single-ref normal fast-forward push; verify public main equals it. Dispatch the existing workflow with that SHA and portable=false once. Preserve windows-2022/x64, Node 22.19.0, standard CPython 3.13.16 and all locks. All downstream TypeScript/Electron, frozen backend/native modules, NSIS, 49 regressions, controls/scaling, real Yahoo/Hyperliquid, install/restart/uninstall stages remain present and keep the existing stop-on-failure behavior. Binaries remain only on the ephemeral runner and are discarded with it. If Python fails again, collect the four sanitized reports and stop for the next reviewed diagnosis/fix. Do not claim skipped downstream checks passed.

## Optional remote Windows 11 x64 acceptance

Research checked 2026-10-19. No service was purchased, rented or provisioned.

- **No-cost automation:** existing GitHub-hosted Windows Server x64 automation provides build/regression evidence under the account's Actions entitlement. It is not a persistent Windows 11 desktop and does not complete interactive acceptance.
- **Time-limited trial, then paid:** Windows 365 Business advertises a one-month 2-vCPU/8-GB/128-GB trial, credit card required, automatic renewal; the US page currently quotes USD 36/user/month afterward. Regional eligibility/taxes/pricing must be checked before approval. Business has no prerequisite Microsoft licensing requirement, unlike Enterprise. Access from macOS using Windows App or the web client. Verify the provisioned OS is Windows 11 and the guest reports AMD64/x64, not ARM64/emulation, before acceptance. This is the simplest proposed dedicated desktop for a short owner-approved acceptance session.
- **Paid infrastructure alternative:** Azure Virtual Desktop with an explicit Windows 11 Enterprise x64 image on an x64 VM. Azure compute/storage/network costs apply; assign an eligible Windows/Microsoft 365/VDA user license for internal access. macOS hardware alone is not a qualifying Windows license. Use Windows App from the Mac. This requires more tenant/network/licensing setup and a separate bounded budget approval.

Sources: [Windows environment limit](https://learn.microsoft.com/en-us/windows/win32/procthread/environment-variables), [Windows 365 trial](https://www.microsoft.com/en-us/windows-365/business/windows-365-free-trial), [Business/Enterprise licensing](https://learn.microsoft.com/en-us/windows-365/business-enterprise-comparison), [Mac/web access](https://learn.microsoft.com/en-us/windows-365/end-user-access-cloud-pc), [AVD prerequisites](https://learn.microsoft.com/en-us/azure/virtual-desktop/prerequisites), [AVD licensing](https://learn.microsoft.com/en-us/azure/virtual-desktop/licensing), [AVD costs](https://azure.microsoft.com/en-us/pricing/details/virtual-desktop/).

After approval, keep installer transfer private to that desktop; no public binary link/artifact. Record guest OS/architecture and installer SHA before installing. Test visible NSIS installation, real native file dialogs, maximize/restore/fullscreen/Escape, restart/persistence, real provider charts, notifications, scaling and remote multi-monitor behavior. Authenticode/SmartScreen and signed version-to-version updates require signed candidates and their separate approval. Remote display checks do not establish every physical GPU/display configuration. An ARM Windows VM on the M2 Mac does not substitute for x64 acceptance.
