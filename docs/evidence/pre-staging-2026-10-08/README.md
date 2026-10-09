# Pre-staging verification evidence — 2026-10-08

Baseline: `8564429`. Local verification only; no production writes or deployment.

`historical-memory-report.json` preserves the root diagnostic artifact from the baseline. It is an unpaced synthetic workload, includes forced-GC pauses and does not establish concurrent-game capacity or production OOM resolution. Its results are historical, not a new verification run.

Cleanup scans report locations and pattern-match counts only. No detected embedded credential patterns in the three targeted artifacts or their available revisions. Pattern scanning is not a comprehensive secret audit. The removed scratch readers printed arbitrary SiteSetting values; they were not executed.

Current reports: `api/aggregate.json` (99 files / 1394 tests), `security/aggregate.json` (188 tests), `financial/aggregate.json` (48 tests), workspace engine (425), multiplayer (395), web (383), independent recovery (31). All passed with zero failed/skipped. Subsets overlap API.

`paced-run-1.json`, `paced-run-2.json` and `paced-run-3-physics-detail.json` contain 60-second paced local runs. `memory-retention.json` repeats the separate established burst/GC workload. These are distinct measurement scopes; neither establishes deployed capacity.

See ../../pre-staging-verification-2026-10-08.md for full provenance, limitations and staging blockers. `verification.json` records local targets, unchanged production-source hashes, build/typecheck exits and migration count. No secrets are required to read evidence.
