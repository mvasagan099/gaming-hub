# New multiplayer room recovery

Date: 2026-10-08. Baseline commit: `52b5a94`. Evidence applies to the local working copy. No production database access, push, or deployment was performed.

## Cause and fix

The screenshot's exact message, “Leave your current room before creating another”, comes from the distributed `room:create` command. Quick Match already released completed durable room memberships, but private room creation and joining another room still rejected every existing membership, including finished games.

Creation now uses the same completed-room recovery service as Quick Match. Joining another room uses it when the previous room differs from the destination. Cleanup runs through the old room's authoritative owner, which rechecks the completed status under its command lock. The new operation waits for acknowledgement and requires the old membership to be gone.

Waiting, starting, and playing rooms still require explicit departure. Cleanup failure blocks creation/join. Rejoining the same room preserves reconnect and rematch behavior. Feature checks, room admission, wallet accounting, settlement, and authentication behavior remain unchanged.

## Current verification

| Check | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Completed-room recovery and command regressions | 1 | 32/32 | 0 | 0 |
| Entire multiplayer suite | 23 | 334/334 | 0 | 0 |
| Entire web suite | 38 | 315/315 | 0 | 0 |

Twenty-one new command-level cases cover private Table Tennis room creation, `room:join`, `match:join`, blocked active memberships, failed cleanup, same-room reconnect, and acknowledgement ordering. Seven cases failed before the fix, reproducing the missing recovery paths; all 32 cases pass after it. These tests exercise the production command dispatcher and recovery service with fixture persistence/owner transport. The full multiplayer suite also includes local Socket.IO integration tests. This is local regression evidence, not a deployed PostgreSQL/Redis smoke test.

- Repository typecheck: PASS across all nine workspaces.
- Repository build: PASS. Existing large web chunk warnings remain.
- Diff whitespace check: PASS.
- Production data touched: NO.
- Deployed: NO. The updated socket server must be deployed before the live private-room flow benefits. The earlier web cleanup fix must also be present in the deployed frontend.

Machine-readable results and executed test-file lists: `private-room-recovery-results.json`.
