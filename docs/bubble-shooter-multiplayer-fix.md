# Bubble Shooter multiplayer gameplay fix

Date: 2026-10-06. Baseline: `decb98a`. Changes are local and uncommitted.

## Confirmed causes

- The server used a 286×460 board, 13 columns, and radius 11. The existing
  solo renderer used 384×580, 12 columns, and radius 16. Aiming and collisions
  therefore described different boards, and server columns could render outside
  the canvas.
- The multiplayer cannon's loaded slot was never synchronized. Its projectile
  used the server's `nextBubble` while the cannon retained its initial color.
- Every snapshot, including opponent-only updates, erased the projectile and
  released the shot lock. Fast responses removed the animation before impact.
- Detached bubbles were counted for scoring but the filtered grid returned by
  `dropFloating` was not assigned back to the authoritative player state.
- Ceiling collision assigned the radius to **x**, snapping shots toward the
  left edge instead of preserving their horizontal impact position.
- The simultaneous score race inherited a ten-second turn clock. Its engine
  could expose a turn deadline despite both players being allowed to shoot.
- Rejected network promises did not release the shooting lock. Mobile taps
  also lacked release-position aiming and protection after a rapid rejection
  followed by a synthetic click.

## Changes

Bubble Shooter now shares the existing solo playfield geometry with its server.
The server and multiplayer aim guide/flight use the same deterministic wall and
collision path. Solo physics and scoring remain local as before.

The server supplies the current cannon bubble and its queued preview. A unique
shot sequence distinguishes a player's new shot from opponent updates and
replayed snapshots. The presentation buffers incoming snapshots until the
cosmetic flight lands, then renders the latest authoritative grid and score.
Pop particles and detached-bubble falling effects follow the server result.

Rejected shots and network errors restore the authoritative board and release
input. A missing response triggers a board resync after eight seconds. Mobile
aiming uses the touch release position and suppresses the follow-up synthetic
click. Rematch/unmount clears the presentation timer and pending animation.

The server actually removes detached bubbles, fixes ceiling impact coordinates,
and no longer uses a turn timer for Bubble Shooter. The existing match timer,
competitive scoring, garbage attacks, server validation, and settlement remain
authoritative. No wallet, authentication, tournament, or database migration
code changed.

## Current verification

| Suite | Files | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Complete game-engine suite | 24 | 334 | 0 | 0 |
| Complete multiplayer suite | 10 | 112 | 0 | 0 |
| All discovered frontend tests | 5 | 44 | 0 | 0 |

- Repository typecheck: PASS across nine workspaces.
- Repository build: PASS for multiplayer, web, API, and socket server.
- Existing frontend chunk-size warning remains.
- 29 added regressions cover both seats, concurrent server shots, invalid and
  spectator actions, board geometry, ceiling impacts, detached bubbles, queued
  colors, flight buffering, duplicate snapshots, mobile inputs, rejection/error
  recovery, resync, reconnect state, and solo isolation.

Frontend component tests exercise the actual event handlers, synchronization
effects, and frame callback with hook/canvas/socket stubs. Framework tests use
the actual authoritative match/action pipeline. These are local regressions;
no deployed two-browser smoke test is claimed.

The broader frontend run initially hit an unrelated test-worker limitation:
Supabase initialization could not find a WebSocket global. The successful run
used a temporary Vitest setup providing the installed `ws` implementation as
`globalThis.WebSocket`, dummy Supabase configuration, and the existing Vite
aliases. No production network or authentication code was altered to address
that test-environment issue. All five frontend files executed successfully.

Machine-readable evidence:
`../security-reports/2026-10-06-bubble-shooter/verification.json`.

## Release scope

No database was changed and nothing was pushed or deployed. Restart local
development services to load the rebuilt multiplayer package. Release the web
and socket server together: the updated presentation expects the updated
authoritative bubble queue and shot sequence. Begin a fresh match for the smoke
test; do not certify this change from an old in-progress engine instance.
