# Gaming Hub game audit

Date: 2026-10-08. Source commit: `d2cac199a97eb034e074bdfd5418baa3d5dbb163`.
Branch: `codex/staging-preparation`. Working tree was clean before audit.

## Resolution

The reproduced issues below have since been fixed locally. See [FIXES.md](FIXES.md) for current changes and passing verification. This report retains the original audit evidence.

## Original audit verdict

**BUGS FOUND.** Existing automated suites pass, but additional requirement checks reproduce three defects. No production code, database data, wallet/security logic, or deployment was changed. Only this audit evidence was added.

## Current complete game-related suites

| Suite | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Game engine | 27 | 425 | 0 | 0 |
| Multiplayer | 27 | 395 | 0 | 0 |
| Web | 41 | 383 | 0 | 0 |
| Total | 95 | 1,203 | 0 | 0 |

All suites were rerun during this audit; no historical totals were substituted. Commands: workspace-local `vitest run --reporter=json --outputFile=...` in packages/game-engine, packages/multiplayer and apps/web. The additional probes ran separately after the full suites.

## Confirmed defects and proposed solutions

### 1. Delayed multiplayer start packets overwrite current match identity — high priority

`apps/web/src/store/multiplayerStore.ts:519` accepts `game:match-started` without checking departed match identity or the current room/match. A second listener for the same event also clears queue/countdown state without identity validation.

Two current-store reproductions fail: an old start packet replaces `new-match` with `old-match`; a packet arriving after successful room leave restores `old-match` instead of retaining null. This is a reproducible state corruption risk for all multiplayer games; it is not proof of its frequency on the deployed network.

Proposed correction: validate start events against authoritative current room/match and departed identities, preserving legitimate first-start/rematch transitions. Scope both listeners consistently. Add reordered-event and reconnect tests. Keep server validation and settlement unchanged.

The reproduction uses multiple listeners per event, matching Socket.IO. The existing room-lifecycle mock keeps just one callback per event, hiding the first handler when a second listener is registered. Improve that mock when fixing the issue.

### 2. Chess repetition draw is not recognized — medium priority

`packages/game-engine/src/chess/engine.ts:310` reconstructs chess.js from FEN on each move. FEN does not contain position occurrence history. Appending SAN to the displayed history does not restore chess.js repetition detection.

Reproduction: `Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1 Ng8`. The same installed chess.js, played continuously, reports threefold repetition, draw and game over. Gaming Hub reaches the same FEN and retains eight SAN moves but reports no draw, no game over and no end reason.

Proposed correction: retain/reconstruct canonical position history for rule evaluation, including recovery/reconnect, and add repetition regression tests. Preserve piece color assignment, logical coordinates and visual orientation.

### 3. Native/browser Back incorrectly opens exit confirmation — medium priority

`apps/web/src/pages/Games/GamePage.tsx:65` blocks history navigation; its native-back handler opens the same modal. This contradicts the requested behavior: visible Exit confirms, while native/browser/gesture Back navigates normally.

All nine games fail browser Back and native Back requirement probes: **18 failed checks**. Existing navigation tests explicitly expect the unwanted modal, explaining why the web suite is green.

Proposed correction: restrict confirmation to the visible Exit action; let Back use normal navigation and route-unmount cleanup. Verify room cleanup runs once and retain server-authoritative settlement.

## Nine-game coverage

The shared catalog, engine registry and routed game page contain all nine games. Cricket is not registered for gameplay.

| Game | Current automated suites | Confirmed issue |
|---|---|---|
| Ludo | PASS | Shared Back and delayed-start defects |
| Chess | PASS | Repetition draw plus shared defects |
| Carrom | PASS | Shared defects |
| Snake & Ladder | PASS | Shared defects |
| Fruit Ninja | PASS | Shared defects |
| Bubble Shooter | PASS | Shared defects |
| Table Tennis | PASS | Shared defects |
| Snake vs Worms | PASS | Shared defects |
| Snooker | PASS | Shared defects |

Passing tests do not certify real-device rendering or live synchronization. Existing suites cover game rules, room lifecycle, private rooms, rematches, state ordering and recovery. No additional game-specific defect was confirmed in the remaining eight engines.

## Evidence and reproduction

`results.json` lists every executed test and its status. `chess-repetition-result.json` records expected and actual rule results. Probe sources are preserved under `reproductions/` with `.txt` suffixes so they do not alter normal test discovery.

To reproduce Back: copy its fixture temporarily to apps/web/src/pages/Games/GamePage.audit-probe.test.tsx and run that file from apps/web with Vitest. To reproduce stale events: copy its fixture to apps/web/src/store/multiplayerStore.audit-probe.test.ts and run it separately. Remove temporary fixtures afterward. Expected current results: 18/18 Back failures, 2/2 stale-start failures. The chess script runs from repository root using `node --import tsx`; its saved import path targets this checkout.

## Not tested / remaining verification

- Two actual deployed clients, real WAN latency, prolonged soak, and mobile rendering/gesture behavior: NOT TESTED.
- Actual occurrence of delayed-start corruption in production: NOT TESTED.
- API, financial, security suites, typecheck and production build were not rerun in this game audit; no application source was modified.
- No push or deployment performed. Fix the three reproduced defects and rerun affected suites before staging multiplayer verification.
