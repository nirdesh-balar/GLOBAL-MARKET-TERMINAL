# Project storage policy

Keep one maintained source checkout with Git history, lockfiles, build scripts, tests, native adapters and docs. Keep required native Python/Node dependencies, current stable source/app reference, necessary rollback archives, checksums and protected investigation evidence. Profiles and signing material are never cleanup targets. GitHub is not the only backup of private source, secrets or user data.

Windows toolchains and temporary candidates belong on Windows CI. Keep release artifacts in approved Releases only after verification; CI artifacts are temporary and expire. Preserve a separate verified backup before removing superseded local releases.

`node scripts/project-cleanup.mjs` is dry-run only. It considers two fixed regenerable compilation outputs in this checkout, refuses symlinks, hashes their contents and reports active/unknown open-file state. `--quarantine --approve=<exact dry-run digest>` requires explicit itemized approval and rechecks current contents/open files before a recoverable rename. Quarantine reports zero recovered bytes because it uses the same disk. There is no automatic purge, pattern-based deletion, cleanup daemon, normal-profile access, dependency removal or old-release deletion.

The private release audit separately inventories old milestone directories. Their allocated sizes may share APFS extents and cannot be summed as guaranteed reclaimable space. Never remove a mixed directory wholesale: it may contain profile backups, source lineage or F/G evidence. Itemize only verified redundant application extracts, establish recoverable backups and obtain approval first.
