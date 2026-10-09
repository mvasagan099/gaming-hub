# Branch parity review — 2026-10-09

Reviewed main `41c6fbe` against `origin/codex/staging-preparation` (`9919d3e`). Local main and fetched origin/main matched. No production data, deployment, or push was performed.

## Confirmed missing fix

The staging branch removed a metadata-only event's unconditional gameplay-version update. Main still contained that update. A countdown event at version 2 therefore caused the subsequent version-2 gameplay snapshot to be discarded as a duplicate, leaving the board at version 1.

Added a regression reproducing the failure (1 failed, 15 passed before correction) and restored only that missing behavior. Gameplay snapshots still advance versions; stale gameplay packets and duplicate event IDs remain filtered.

## Changes already present

- 2 MiB socket buffer and sequence-number acknowledgments.
- Packed Carrom state decoding and post-shot recovery when no snapshot arrived.
- Bounded admission queues, lifecycle admission and distributed routing limits.
- Engine-authoritative deadlines and disabled-rematch enforcement.

Main additionally contains durable history retention, archived-action idempotency, local URL handling, UUID recursion protection and newer game smoothing. Replacing main with the older branch would discard these improvements.

## Explicit removal

PR #2 (`3b68799`, containing `427b7cc`) deliberately removed replay controls and disabled replay paths. This was not restored as an incidental branch correction. Historical archive retention is separate from a user-facing replay feature.

## Verification

- Web: 48 files, 411 passed, 0 failed, 0 skipped.
- Multiplayer: 32 files, 444 passed, 0 failed, 0 skipped.
- Production build: passed using isolated test provider configuration; existing large-chunk warning remains.
- TypeScript: passed across all 9 workspaces (exit 0).

The pre-existing registrationCountry fixture change is separate and excluded from this correction. Full API and live Render parity were not rerun for this web-only fix. Public hosted health responses do not identify the deployed commit; live behavior is not certified by these local tests.
