# Carrom multiplayer shot playback

Date: 2026-10-08. Local frontend changes; no deployment or production data access.

## Defects fixed

- The client identified shots only by the last action's millisecond timestamp. Distinct accepted strikes can share that timestamp; older delivered states can also retrigger animation. The driver now uses the authoritative advancing turn number within the match and rejects stale versions/turns before callbacks or effects.
- A four-second local timeout discarded prediction and unlocked another strike without a confirmed outcome. Late success could replay the animation from the beginning. Pending shots now retain their original playback origin and request full authoritative state without resending a strike.
- Transport failure was treated as a definitive rejection. An uncertain acknowledgement now requests state recovery while holding the pending shot; definitive server rejections still roll back.
- Accepted strikes with missing state broadcasts request full-state recovery. Reconnect also requests authoritative state.
- Restored/full-state updates could replay effects from a previous event array. Mount restores the settled board without historical effects, and recovery only processes fresh event arrays.
- Remote playback previously always started from frame zero. It now accounts for elapsed time already represented by serverTimestamp minus lastActionAtMs. This does not estimate unknown network transit delay.

## Verification

- Carrom web regressions: 64/64 across four files.
- Entire web suite: 376/376, zero failures/skips.
- Web typecheck: PASS.
- Web build: PASS; existing large chunk warning remains.
- Whitespace/diff check: PASS.

Regression coverage includes timestamp collisions, stale and duplicate packets, missing broadcasts, late confirmations beyond four seconds, uncertain transport replies, retained local prediction, seat transforms, and stale effect arrays. All authoritative physics, scoring, turn decisions, settlement and wallet behavior remain server controlled and were not changed.

## Deployment limits

Changes are local. No live two-device latency measurement or production smoke test was performed. Network/server latency still affects arrival; the fix prevents known client replay and recovery defects rather than promising zero lag. See companion JSON for counts.
