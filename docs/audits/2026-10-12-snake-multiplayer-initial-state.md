# Snake vs Worms: initial state recovery

Date: 2026-10-12. Starting commit: `888cde4`.

## Reproduced defect

The room can reach `playing` while its readiness phase still waits for both
boards. If the initial `game:state` packet is missing, the frontend has the
server's room match ID but no hydrated store match ID. The Snake driver needs
that hydrated ID and state before drawing the board. The board-loaded ACK
requires a rendered board. Physics waits for the ACK, so subsequent ticks
cannot break this dependency. Refresh invokes synchronization and can recover.

A new regression reproduced this failure: initial synchronization sent zero
requests when `room.matchId` existed but `store.matchId` was null. Before the
fix: 1 failure / 52 passes in the room lifecycle file.

## Fix

- The multiplayer route requests the missing authoritative snapshot using the
  room's match ID, without synthesizing game state or readiness.
- Recovery retries every three seconds, one request at a time, for at most
  thirty seconds. Each socket ACK has a three-second deadline.
- Recovery stops on hydration, route unmount, room departure, match change or
  match completion. Practice and replay views do not start recovery.
- Responses are checked against the current socket, room and authoritative
  match. Older versions cannot replace newer state within the same match.
- Initial recovery resets stale result/deadline data from a previous match.
- Server validation, load confirmation, ownership, gameplay and financial
  settlement are unchanged.

## Current verification

- Full web suite: **59 files, 526 passed, 0 failed, 0 skipped**.
- Ten new cases cover initial recovery, stale departure, retry bounds,
  one in-flight request, successful hydration, disconnect and timer cleanup.
- Production build: PASS. Existing large-chunk warning remains.
- Typecheck: PASS across all nine workspaces.

The full-suite test harness initially assumed route cleanup was the first
effect. The recovery effect follows that existing effect; no test was removed
or weakened. Typecheck initially caught a nullable room guard; it was corrected.

## Memory and hosting evidence

Read-only Railway samples over the preceding hour: peak CPU **0.423 cores**
against a **2-core** limit; peak memory accounting **0.169 GB** against about
**1 GB**. These samples do not demonstrate saturation. They do not rule out
short spikes or long-running leaks; no instance upgrade was made.

The existing local retention exercise ran 100 match lifecycles, 10/25/50-room
bursts, 100 simultaneous sockets and 500 reconnects. Final heap was **29.19 MiB**;
peak RSS was **367.95 MiB**. Room, match-related, player, sync and timer maps
cleared. The remaining 370 idle security profiles have a TTL and a 5,000-entry
cap; three game payload diagnostic entries are fixed by game type.

This forced-GC synthetic exercise excludes production DB/Redis/financial paths.
It is neither a gameplay capacity benchmark nor proof that a deployed OOM is
fixed. No production fixtures or financial writes were performed.

Evidence: `docs/evidence/snake-start-2026-10-12/`.
Live two-client startup without refresh still requires verification after the
frontend deployment completes.
