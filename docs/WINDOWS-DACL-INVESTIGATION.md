# Windows DACL investigation — local diagnostic review

Baseline: a50ce594530315098cbdedd0f1b53e270f17da07. Native run 39230124975 recorded 2,401 passes and two call-phase AssertionErrors, at MIGRATION_DACL_TRUSTEES and PROFILE_DACL_TRUSTEES. Nonempty trustee assertions passed. No native SID values or descriptors were retained; the cause is still unconfirmed.

## Why this patch retains the failing text predicates

The approval conditions permit replacing text comparisons only after native semantic equivalence is demonstrated. Microsoft documents both SID strings and SDDL aliases, but documentation and Mac fixtures do not establish what the failed Windows objects contained. This patch therefore adds an independent **read-only test oracle and source-bound diagnostics**. It does not normalize the failures away. Original trustee restrictions, backup/restore assertions and POSIX modes remain enforced. No application code or production permissions change.

A future authorized native run may still fail at an object-specific EQUIVALENT_SID checkpoint even if binary comparison passes. That is intentional evidence collection, not a complete Windows fix. An actual unexpected trustee remains a failure requiring separate investigation and, if confirmed unsafe, a separately reviewed production security correction.

## Documented basis

- [ConvertStringSidToSidW](https://learn.microsoft.com/en-us/windows/win32/api/sddl/nf-sddl-convertstringsidtosidw) accepts standard SID strings and SID constants such as BA; successful allocated SIDs are freed with LocalFree.
- [EqualSid](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-equalsid) compares valid binary SIDs. IsValidSid precedes every comparison. No prefix, account-name, environment-value or text-alias matching admits trustees.
- [GetAce](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-getace) and [ACCESS_ALLOWED_ACE](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-access_allowed_ace) define binary ACE enumeration and the inline SidStart field.
- [ACE_HEADER](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-ace_header), [ACE inheritance](https://learn.microsoft.com/en-us/windows/win32/secauthz/ace-inheritance) and [GetSecurityDescriptorControl](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-getsecuritydescriptorcontrol) distinguish effective/inherit-only/inherited grants and protected DACL control bits.

## Oracle policy and scope

The oracle reads descriptors without any SetFileSecurity, chmod, ACL creation or mutation. It validates descriptor/ACL structures, bounds, every ACE, and SID validity. Expected identities are exactly SYSTEM, built-in Administrators and the actual process-token user. EqualSid must match exactly one role for each of three effective full-file-access ACEs. Duplicate, missing or overlapping role grants fail. Everyone, Users, Authenticated Users and unrelated users are not accepted.

The protected root directory must have explicit OI|CI grants and no inherited grant. The child profile and backup files must have effective inherited grants; the migration subdirectory must retain OI|CI inheritance. Flags including INHERIT_ONLY and NO_PROPAGATE do not silently pass. Parent/root policy is also inspected for the migration backup. This is a conservative verification of this application's exact policy, not a general AccessCheck implementation or proof against every filesystem/reparse-point/privileged-access threat.

Structurally validated, recognized deny, object-specific, callback and audit ACE kinds are rejected as SPECIAL_ACE. Reserved/unknown layouts remain API_INCONCLUSIVE rather than being guessed. They are not dropped while parsing only allow ACEs. Unsupported/failed APIs, malformed bounds/SIDs and incomplete serialization are inconclusive, never safe. A missing, NULL or empty DACL fails. The semantic and legacy comparison in the oracle use the same descriptor snapshot; expected SID allocations and serialized descriptor memory are released.

## Privacy-safe observation

Only literal source-bound assertion labels can enter the existing checkpoint field. No new public evidence schema or artifact file is introduced. Diagnostic classes are:

- API_INCONCLUSIVE
- MISSING_DACL
- SPECIAL_ACE
- UNEXPECTED_INHERITED
- UNEXPECTED_ALLOW
- PROTECTION_MISMATCH
- INHERITANCE_MISMATCH
- RIGHTS_MISMATCH
- EQUIVALENT_SID (all strict binary-policy checks succeeded, legacy subset did not)

Original tests use PROFILE_DIR, PROFILE_CHILD and MIGRATION_BACKUP prefixes. Separate root/parent checks use MIGRATION_ROOT_POLICY and MIGRATION_PARENT_POLICY; a failure there means an ancestor policy was not verified and does not infer its underlying reason. The additional disposable-object test has four separately catalogued cases, so its validated case index identifies directory, child, migration parent or backup even if an earlier original assertion stops another test. Raw API errors, SIDs, SDDL, account names, descriptors, paths and environment values are never added to artifact diagnostics. All failures preserve original pytest behavior and exit status. A missing diagnostic does not imply success.

## Tests and approval boundary

Controlled Mac fixtures exercise binary reader bounds, API prototypes, EqualSid use/validity, alias identity, unrelated rejection, inheritance/protection/rights, unsupported ACEs, fixed-code failures and allocation cleanup. These are simulations. On Windows, the alias conversion cases call real Windows APIs and disposable object cases inspect actual temporary NTFS objects. Normal user profiles are never the test target.

Full Python, observer/catalogue, privacy/reporting, release-control and source-integrity results accompany the local review report. No native Windows security result is claimed before an approved run.

One future Windows Server 2022 x64 workflow is proposed at the exact reviewed local commit, source_ref=<reviewed SHA>, portable=false, Node 22.19.0, CPython 3.13.16 x64. Approval is required before any push or dispatch. Keep fail-fast stages and the existing four sanitized evidence files only; no binaries or raw security data. Official v1.0.0 remains unpublished and blocked.

## Corrected ACE consistency review

The unpublished diagnostic commit 3cb5b2fe5aece3cd2f440c192e140659f89c3738 and its blocked-review evidence remain preserved. This replacement is based directly on public main a50ce594530315098cbdedd0f1b53e270f17da07 and does not include that defective intermediate commit in its ancestry.

The former reader compared an allow-only serialized count against all binary ACEs before classification. Its deny fixture also contradicted itself: binary deny records were serialized as allow records. Both defects are corrected here without modifying production ACLs or original trustee assertions.

The reader now validates every binary ACE, including SID bounds/validity, object-specific optional GUID offsets and ACL revision, record alignment/order and complete ACE consumption. Known callback payloads are opaque and never executed. It serializes the same descriptor, uses the documented [ConvertStringSecurityDescriptorToSecurityDescriptorW](https://learn.microsoft.com/en-us/windows/win32/api/sddl/nf-sddl-convertstringsecuritydescriptortosecuritydescriptorw) codec to reconstruct it, validates that descriptor again, and requires identical ordered ACE bytes and matching DACL presence/protection. Alias spellings thus resolve to the same binary SID, while contradictory type/SID/rights/flags/GUID/order evidence cannot be marked secure. The reconstructed descriptor is freed with LocalFree on success or failure.

Only after this consistency check may a recognized non-allow ACE reach SPECIAL_ACE. The legacy allow-only check runs solely for a descriptor consisting entirely of ordinary allow ACEs. Every original trustee/rights/inheritance/protection restriction remains enforced. A malformed later ACE takes precedence over an earlier valid special ACE. Unknown/reserved layouts, unsupported codec output and contradictions remain API_INCONCLUSIVE; missing/NULL/empty DACLs remain blocked. No raw native security data is added to public output.

The byte-exact codec check is intentionally conservative. A legitimate descriptor that the Windows codec normalizes differently will be inconclusive, not declared secure; native Windows acceptance is still required. This is not a general SDDL interpreter or access-control engine. Windows APIs parse conditional syntax; no fixture or application code evaluates user expressions.

Controlled fixture records now drive matching typed binary and serialized output. Separate contradiction modes deliberately change only the serialization. Regressions cover mixed/three-deny, object/callback/audit/unknown types, invalid SID data, malformed boundaries, special-then-malformed records, duplicate/extra rights, unexpected inherited trustees, equivalent SIDs, child/backup inheritance and canonical evidence rejection. Fixture success on macOS is not native Windows ACL verification.
