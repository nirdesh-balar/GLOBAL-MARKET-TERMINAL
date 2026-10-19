# Evidence-only Windows validation

Review base: `ae8fb94e126a2d966e4bf058cf05911944bc6b8f`.
For the separately reviewed diagnostic extension after e36aa63, see
[Windows failure diagnostics](WINDOWS-FAILURE-DIAGNOSTICS.md). It retains this exact
four-file upload policy and limits, adds source-catalogue-validated failure identifiers
and controlled codes in schema v2, and keeps original traces runner-local.
This is an infrastructure patch. Publishing it and dispatching it require separate
owner approval. No binary download, release or stable tag is authorized.

## Public access and audited routes

Actions artifacts in a public repository are downloadable by signed-in users with
repository read access. They are not owner-private:
[GitHub artifact permissions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts?tool=webui).
Caches are also shared within GitHub's branch scopes and must not hold private data:
[GitHub cache security](https://docs.github.com/en/actions/concepts/workflows-and-actions/dependency-caching).

The audit found these routes:

| Producer / route | Sensitive content / binary risk | Policy in this patch |
| --- | --- | --- |
| Windows broad candidate upload | NSIS/portable EXE, unpacked Electron, DLL/PYD/NODE files, private fingerprints and reports | Replaced by four explicit text paths |
| Raw test-results upload | Arbitrary JSON/XML/logs, screenshots, paths, profile state, provider data | Removed from Windows upload; never copied into public staging |
| Rich Windows collector / artifactManifest | Complete binary checksums, raw nested regression output, command paths and copied diagnostics | Remains runner-local; public projection copies none of it verbatim |
| Windows package / frozen backend | backend/dist-windows, native modules, package build, installed temporary app | Build and smoke tests preserved; no eligible upload path |
| Command stdout/stderr | Error stacks, credentials, environment, private paths, unexpected binary output | Wrapper saves raw bytes only to runner-local logs and prints fixed stage/exit summaries |
| setup-node npm cache | Dependency archive persistence outside evidence allowlist | npm cache option removed; no cache-save action introduced |
| macOS candidate workflow | Whole candidate directory, DMG/ZIP/app binaries | Artifact upload removed; build/test commands retained |
| Source regression workflow | Whole unreviewed test-results directory | Artifact upload removed; build/test commands retained |
| Existing approved-draft-release workflow | Intentional future release asset upload | Unchanged, never invoked here; separate owner-only environment/token and explicit acceptance gates remain required |

The existing prior failed run's artifact was previously inspected: only two
verification reports, no installer. It is historical evidence and is not deleted.
Package configs retain future release metadata, but both package scripts explicitly
pass `--publish never`. This patch neither invokes nor weakens release approval gates.

GitHub's own managed Action logs are separate from uploaded artifacts. No personal
profiles or signing credentials are provided to these jobs. Managed setup Actions
remain pinned to reviewed SHAs. Wrapper-managed Windows build/test output is not
forwarded to public logs. This is not a claim that arbitrary future Actions or a
compromised runner can be made safe by an artifact extension filter. The source/macOS
workflows have no artifact uploads after this patch; their independent console-log
policy is not a newly certified Windows privacy result.

## Full Windows execution stays intact

Owner-only manual dispatch, exact SHA validation/checkout, nonpersistent checkout
credentials, read-only contents permission and SHA-pinned Actions remain. CPython
3.13.16 x64 and locked npm/Python dependencies are unchanged. The workflow still
runs the full Python suite, TypeScript, Electron, frozen backend and its startup
smoke, NSIS, all 49 numerical/Electron scripts, window controls, scaling and packaged
real-provider/install/restart/uninstall checks. A dedicated privacy suite is added.

All compiled output and raw evidence exist only on the ephemeral runner. They are
discarded with the runner; this design intentionally does not retain a private EXE
elsewhere. Retaining a private installer would require another approved storage plan.
No signed API, wallet, trading feature or application behavior changes here.

## Exact public allowlist

All paths below are rooted at `ci-evidence-public/`, outside the package output.
The upload action explicitly names these four files; it does not upload a directory,
wildcard, package tree, nested archive, screenshot, log or private results directory.

| Relative path | Content type | Maximum bytes |
| --- | --- | ---: |
| WINDOWS-VERIFICATION.json | application/json | 65,536 |
| WINDOWS-VERIFICATION.md | text/markdown | 16,384 |
| INSTALLER-SHA256.txt | text/plain | 256 |
| EVIDENCE-SHA256SUMS.txt | text/plain | 1,024 |

The JSON contains only fixed product/version labels, exact source SHA, host enums,
requested Python version, boolean checks, stage/status enums, bounded numeric exit
codes/timings/test counters, a small vetted error-code enum and installer SHA-256/size.
Manual Windows 11 and native-update acceptance remain NOT VERIFIED; stable is false.
Python/regression/installation outcomes are represented in that one typed summary.
The other three reports are deterministically rendered from it. The evidence
manifest hashes the other three files; it does not recursively enumerate package files.

There is no public free-text error/output field. Commands, arguments, exception text,
environment, signing-certificate subjects, directories, tokens, personal identifiers,
watchlists, drawings, candles, screenshots and binary payloads are omitted rather
than guessed safe by redaction regex. Detailed raw failures remain runner-local;
public failures report the actual stage and exit status without reproducing raw data.
Managed provisioning failures retain their existing diagnostic in the Action's log.

## Guard and failure behavior

`windows-ci-public.mjs prepare` reads only the known runner-local verification JSON
(16 MiB input limit), projects allowed scalar fields and streams a hash of only the
known build installer (2 GiB input limit). The candidate is never copied or printed.
Its PE header is checked before hashing. No arbitrary input file enumeration is used.

Staging must not already exist: preparation never deletes or reuses an injected
directory. Every parent below the canonical checkout is checked. Symlinks/junctions,
hardlinked files and nonregular files are rejected; no-follow opening and file
identity/size checks narrow file replacement races. Output uses exclusive creation.

The independent `verify` step demands the exact four-file set, no directories,
links or extras; checks sizes and ASCII text; validates the complete JSON schema
(including allowed keys); regenerates all canonical bytes and hashes; and compares
every byte. Renamed executables, ZIP content, scripts, encoded extra fields,
credentials in enum fields and modified manifests cannot satisfy this model.
An extension alone never makes a file uploadable. Upload requires both preparation
and final validation to succeed. Explicit file paths also exclude additional files
created after directory validation. These controls assume the reviewed trusted
workflow and runner, not an attacker with control of the upload process itself.

Missing test data produces NOT EXECUTED, NOT BUILT and BLOCKED. Failed commands
return their original nonzero exit status; there is no continue-on-error. Safe
failure evidence can upload while the job remains failed. A missing/malformed
private report or unsafe staging makes preparation fail closed and upload is skipped.
CLI validation exceptions print a fixed BLOCKED message, never offending parser data.
A failed private collector or failed/invalid/skipped tests cannot become READY.

## Local verification and approval boundary

The privacy tests use only tiny synthetic PE/ZIP/script fixtures under fresh temporary
directories; they do not build, execute or expose a real candidate installer. They
cover successful checksum-only projection, missing/partial reports, original failure
status, secret/path omission, malformed/oversized/renamed content, nested archives,
symlinks/junctions, hardlinks, arbitrary files, hash tampering, source mismatches and
sanitized console failures. The existing early-reporting suite is retained.

Local macOS results do not establish Windows filesystem/ACL behavior, native
packaging, provider charts or installer acceptance. Those require the next explicitly
approved exact-SHA Windows run. No push or dispatch is performed while preparing
this patch. New approval must cover only the exact reviewed source commit, Windows
validation and these publicly accessible text reports. It does not authorize binary
artifacts, installers, stable tags or GitHub Releases.
