# Account-specific finished-room recovery

Date: 2026-10-08. Baseline: `2802362`. Local working-copy verification only. No deployment, production database access, or live account reset was performed.

## Reproduced defect

The user's live screenshot shows room creation blocked for one account while another account works. The affected live account and deployed commit have not been independently inspected. An account-specific durable-room recovery defect was reproduced locally using the actual room manager, checkpoint serialization, and checkpoint restoration.

After a game ends, one player can leave while the other remains registered. The original engine roster correctly retains both participants for historical match state. The room checkpoint correctly retains only the remaining member. On owner restart or takeover, restoration incorrectly required those lists to be identical, failing with `INVALID_MATCH_PARTICIPANTS`. The remaining account's durable membership then cannot be recovered for acknowledged cleanup. This failed for all nine games; original game-load confirmations also remained tied to both historical participants.

## Fix

For a room that is both `ended` and has a finite match completion timestamp, restoration validates remaining participants as a subset of the original engine roster, with unchanged identity and seat. The complete engine roster and original game-load confirmations remain intact. A spectator-only finished room can retain its original historical host until the spectator leaves.

Active/waiting/starting rooms still require exact roster equality. An unfinished match cannot obtain the completed-room exception merely from an `ended` room label. Unknown participants, changed seats, incompatible engine versions, and outsider game-load confirmations remain rejected. Actual room membership still controls access: historical departed participants cannot leave, move, sync, or rematch through the command dispatcher.

Restored completed memberships can use the existing owner-routed cleanup gates before creating, joining, or searching for another room. The test uses actual room-leave operations to verify removal and confirms that cleanup never invokes another forfeit or abort. No wallet, payout, settlement, authentication, or game rules were changed.

## Current evidence

| Check | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| New checkpoint recovery/security cases | 1 | 23/23 | 0 | 0 |
| Entire multiplayer suite | 24 | 357/357 | 0 | 0 |
| Entire game-engine suite | 27 | 421/421 | 0 | 0 |

- Before the fix: ten initial recovery cases failed with `INVALID_MATCH_PARTICIPANTS`.
- Repository typecheck: PASS across all nine workspaces.
- Repository build: PASS; existing large web chunk warnings remain.
- Diff whitespace check: PASS.
- Tests used local fixtures and localhost Socket.IO. They did not access production PostgreSQL, Redis, users, or funds.
- Live account recovery: UNVERIFIED. The socket server needs the updated recovery implementation deployed, followed by a real affected-account retry. This report does not claim that the account's live membership has been cleared.

Machine-readable evidence: `account-room-recovery-results.json`.
