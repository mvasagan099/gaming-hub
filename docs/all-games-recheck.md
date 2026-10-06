# All nine games: current recheck

Date: 2026-10-06. Base commit: `31ee31c`. Target: the current working tree, including the earlier uncommitted rematch and navigation fixes. This is a game verification report, not a full production/security release audit.

Follow-up: the two Fruit Ninja UI findings below are now fixed locally. See [the mobile fix verification](fruit-ninja-mobile-fix.md) for fresh results; the original recheck evidence below is preserved.

## Result

All nine games remain registered in the catalog, authoritative engine registry, and result adapter registry. All nine practice launch flows loaded in the browser. Automated verification passed **866/866 tests across 62 files**, with no failures or skips. Typecheck and build passed.

**The UI is not fully clear:** Fruit Ninja's portrait result panel is rotated and clips its replay control; its active portrait view also contains two exit controls. Deployed two-account multiplayer and physical native Back remain unverified in this run.

No production logic was changed during this recheck. Earlier working-tree changes were preserved. No production database was accessed, and no commit, push, or deployment was performed.

## Fresh automated results

| Suite | Files | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|---:|
| Complete game engine | 24 | 333 | 333 | 0 | 0 |
| Complete multiplayer | 12 | 137 | 137 | 0 | 0 |
| All discovered web test files | 11 | 95 | 95 | 0 | 0 |
| API game lifecycle / rematch / financial safety | 8 | 99 | 99 | 0 | 0 |
| API tournaments / tiers / history / recovery / matchmaking | 7 | 202 | 202 | 0 | 0 |
| **Total** | **62** | **866** | **866** | **0** | **0** |

The [results manifest](all-games-recheck-results.json) contains every executed test file, case status and file duration. The API run intentionally selected 15 game-related files; it was **not the entire API suite**. Tournament routes passed 61/61 and tier combinations passed 93/93 in this fresh run.

Coverage includes authoritative move validation, stale/duplicate packets, match identity, reconnect, rematch authorization and participant preservation, game result validation, practice wallet isolation, concurrent financial recovery, match abandonment/timeout, persistent match state, capacity and game/tier configuration. Web regressions exercise mode selection, room cleanup races, visible Exit confirmation and actual Capacitor Back listener behavior.

Commands: workspace `npm run test` for game engine and multiplayer; web `vitest run` with the existing temporary Node/WebSocket harness; API `vitest run --config vitest.config.ts` in two sequential selected groups. API global setup and cleanup used only the disposable localhost PostgreSQL container on port 5541 and database `gaming_hub_match_start_20261006_test`, with test-only external-service configuration. The container was stopped after tests. The isolated frontend preview used unavailable localhost API/socket endpoints, preventing production calls.

`npm run typecheck`: **PASS**, nine workspaces, exit 0.

`npm run build`: **PASS**, exit 0. Vite still reports bundles larger than 500 kB; this is a performance warning, not a failed build. No new missing-import or build errors were reported.

`git diff --check`: **PASS**.

## Browser observations

Local browser practice checks used desktop and 390×844 portrait views. These were launch and selected-control smoke checks, not complete manual playthroughs.

| Game | Current browser evidence |
|---|---|
| Ludo | Practice setup and Phaser board loaded; dice control exercised; Reset Match returned to setup. |
| Chess | Practice setup loaded; White at bottom, Black opponent label; e2–e4 recorded once, followed by Nf6 in the same chronological history row. |
| Carrom | Rules, board and mobile scores loaded; striker slider changed 0 → 1; dragging a shot entered the active-shot presentation; Exit confirmation and confirmed navigation worked. Overlap/pocket mechanics are additionally covered by engine/web regressions. |
| Snake & Ladder | Board, players and dice UI rendered inside the 390-pixel viewport; dice control exercised. |
| Fruit Ninja | Desktop and portrait arenas loaded; result/replay controls appeared; Play Again removed the result panel and restarted. Portrait layout defects below remain. |
| Bubble Shooter | Mobile grid and cannon loaded; firing changed the drop counter from 2 shots to 1. |
| Table Tennis | Desktop/mobile court and score HUD loaded; serve input responded; one mobile exit control, document width 390; Exit → Cancel stayed, browser Back returned directly to Home without a dialog. |
| Snake vs Worms | Arena/bots rendered and mass/length progressed; result panel appeared; Play Again reset mass to 0 and length to 15; result Exit to Lobby opened confirmation. The result overlay intentionally intercepts the background exit control. |
| Snooker | Mobile vertical table and scoreboard fit within screen; turn timer/timeout penalty progressed. Cue-ball placement/shot was not conclusively verified manually in this run; rules/physics remain covered by automated tests. |

`/games/cricket` redirected to Home. Home displayed exactly the supported nine games. Searches of runtime source, active assets, catalog and seed found only archived-history compatibility and historical test fixtures for Cricket; no active engine or result adapter remains.

## Remaining findings and next verification

1. **Fruit Ninja portrait result layout — UI failure.** At 390×844, the replay button measured `left = -20.796875`, width 47.203125, height 348 pixels after rotation. Part of the button was outside the screen. `FruitNinjaPhaserGame.tsx` rotates its entire parent by 90 degrees, including the fixed result overlay from `FruitNinjaOverlays.tsx`. Keep the game arena rotation separate from an upright viewport-sized result overlay, then recheck replay/exit at narrow widths. Early HUD screenshots were taken during entrance animation, so permanent timer clipping is not separately established.
2. **Fruit Ninja portrait duplicate exits — UI inconsistency.** The shared floating Exit Game at (10,10), 32×32, and the scene's Exit to Menu at (344,798), 34×34, were both visible during active practice play. Use one owner for the active-game exit control while retaining the result-screen exit action.
3. **Live multiplayer/device smoke coverage — outstanding.** Real two-account matchmaking, deployed sockets, network interruption, mobile touch gestures and physical Android Back were not exercised against a deployed environment. Automated multiplayer/API validation passed, but that alone does not establish deployed connectivity.
4. **Frontend bundle size — performance follow-up.** Review existing large chunks using a bundle analysis before choosing further splitting; no unrelated refactor was made here.

No wallet, authentication, tournament, referral or security behavior was altered to satisfy these checks.
