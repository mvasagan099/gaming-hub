# Restored multiplayer prerequisites — 2026-10-09

## Baseline and scope

The checkout began clean on `main` at `c0d6b79`. The previously reported prerequisite fixes were absent: they had been verified as uncommitted changes on another branch. Those older results were not reused as current evidence. User explicitly authorized restoring prerequisites before history limits.

During restoration, separate work added and committed gameplay checkpoint performance changes as `3c03ced`. Those changes were preserved and are outside this restoration. Current tests cover the combined working-tree source based on that commit; prerequisite source hashes are recorded in the companion evidence file.

## Restored behavior

- Ordinary room work is limited to 64 pending tasks per room and 1024 total before retaining task closures. Rejected work does not execute.
- Authenticated routing admits at most 32 outstanding operations per player and 1024 total; pending remote-owner RPCs are capped at 256.
- Trusted server lifecycle callbacks retain FIFO admission under ordinary overload. Clients cannot select this exemption. These limits bound ordinary admission, not total RAM or supported concurrent-player capacity.
- Recovery sweeps and per-room lease renewals do not overlap themselves.
- Engine-owned match deadlines replace the generic ten-minute input cutoff, preserving untimed and longer Chess matches. Expired Carrom input is rejected while resignation remains available.
- Disabled rematches reject before consent or funding.
- Carrom requests an authoritative snapshot when a successful shot acknowledgement arrives without a newer shot state. It does not resend the shot or request another snapshot when the broadcast already arrived.
- Existing owner fencing, commit-before-publication, rollback, action identity/sequence checks, result outbox and financial protections remain in place. Wallet/security production logic was not changed.

## Current verification

| Suite | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| New prerequisite tests (also included in multiplayer below) | 3 | 12 | 0 | 0 |
| Complete multiplayer | 31 | 433 | 0 | 0 |
| Complete web | 46 | 396 | 0 | 0 |
| Complete game engine | 29 | 440 | 0 | 0 |
| Distributed restart recovery | 1 | 37 | 0 | 0 |
| Selected financial/IDOR/socket-security | 7 | 78 | 0 | 0 |

Typecheck: **PASS**, all nine workspaces. Complete production build: **PASS**. Existing frontend warning: chunks exceeding 500 kB; this is a loading-performance concern, not a compilation failure.

API fixtures used only disposable localhost PostgreSQL at port 5540 and isolated Redis at port 56482, with dummy external providers. No production/staging writes or migrations were performed by this restoration. Full API aggregation was not rerun; the selected seven-file result must not be described as the complete API suite. No push or deployment was performed by this task.

## Remaining work

Recorded action history and local state snapshots were intentionally not truncated. MatchManager still uses historical action identities after its short-lived cache evicts them, and completed-match archival still consumes history. Safe limits need durable duplicate protection and preservation of required archival/recovery data before trimming. Queue limits alone do not resolve this retention issue.

Deployed Render memory/CPU behavior and real-client latency remain unverified. Local passing tests do not prove the production OOM incident resolved or establish a concurrent-game capacity.

**Prerequisite restoration: VERIFIED LOCALLY.** Overall production readiness remains **NOT PRODUCTION READY** pending the remaining history/retention review and release/deployed evidence.
