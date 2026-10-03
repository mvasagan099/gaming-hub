# Remediation evidence

Current release evidence is generated in `api-pass-final1/aggregate.json`, `api-pass-final2/aggregate.json`, `release-summary.json`, and the repository's `SECURITY_REMEDIATION_REPORT.md`.

`full-api-manifest.json` assigns every currently discovered API file once. The two final passes execute the complete same manifest. `clean-state-before-pass2.json` verifies the intervening reset of only the disposable localhost database.

Earlier `api-pass-1`, diagnostic folders, individual probe/selection JSON files and their logs show investigation and fixture corrections. They are historical diagnostic evidence and must not be substituted for final-source totals. In particular, overlapping diagnostic runners used the separate temporary database; their failed diagnostics are not final regression results.

`migration-summary.json` records a newly created fresh database and a separately created six-migration baseline upgraded to seven, including schema comparison and a controlled ledger preservation fixture. It is not a production backup restoration.

All database targets in this evidence are disposable localhost targets. External financial/auth/email services use dummy settings, mocks, or local HTTP servers. No live provider certification, production data change, deployment, or Git push occurred.
