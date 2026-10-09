# Game audit fixes — 2026-10-08

The three reproduced defects in REPORT.md are fixed in the working tree based on commit d2cac19. No deployment, push, database writes or wallet/security/settlement changes were made.

## Changes

- Multiplayer: match-start notifications require an active, non-departed room and the current authoritative match identity. Removed the duplicate unguarded handler. Old packets cannot revive departed matches, overwrite newer matches, or clear completed results. First start and rematch transitions have positive tests. The lifecycle socket mock now faithfully invokes all listeners registered for an event.
- Chess: persist normalized position identities alongside SAN history. Include side to move, castling rights and legal en-passant rights; omit move counters. The third occurrence ends the game as a repetition draw. Snapshot recovery retains counts; older standard-game snapshots recover counts from SAN when replay reproduces their FEN. Custom snapshots without recoverable history start counting at their current position. Illegal moves do not enter counts/history. Colors, orientation and SAN ordering remain unchanged.
- Navigation: only visible Exit opens the confirmation. Removed game-specific router/native Back and beforeunload interception. Existing application Back handling navigates normally; route unmount owns room cleanup. Confirmed Exit retains its leave-once guard, StrictMode safety and pending-ACK navigation protection.

## Current verification

| Suite | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Engine | 27 | 429 | 0 | 0 |
| Multiplayer | 27 | 395 | 0 | 0 |
| Web | 41 | 367 | 0 | 0 |
| Total | 95 | 1,191 | 0 | 0 |

Repository typecheck: PASS (all workspaces). Production build: PASS. git diff --check: PASS.

Web totals decreased because obsolete tests demanding Back confirmation were replaced with tests of the requested normal navigation behavior. Tests were not skipped. Added Chess repetition/recovery/illegal-move coverage and delayed-start/finished-match/current-start/rematch checks. After the full suites, the lifecycle suite was rerun with a typed winner fixture and passed again.

Build warning: existing frontend chunks exceed 500 kB; build completes, but this remains a loading-performance consideration. Typecheck emits an npm warning about the existing -ws shorthand.

Live two-device behavior, deployed network latency and physical-device gestures remain NOT TESTED. These local fixes do not certify production readiness. No push or deployment performed.
