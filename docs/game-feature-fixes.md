# Gaming Hub game feature fixes

Date: 2026-10-06. Base commit: `31ee31c`. Verified the current working tree, including the earlier uncommitted rematch changes. The four issues in [the game recheck](game-feature-check.md) are addressed locally.

## Changes

1. **Back navigation:** removed GamePage's `popstate`/extra-history trap and GameWrapper's `beforeunload` prompt. Visible Exit still opens “Are you sure you want to exit the game?” with Cancel / Exit Game. Browser/gesture Back follows router navigation; the existing Capacitor listener keeps its direct Back/root behavior. Route cleanup invokes the existing room leave service, whose immediate membership clearing prevents duplicate external leave events. StrictMode effect replay does not leave the room. If Back occurs while confirmed Exit waits for its ACK, that ACK cannot cause a second navigation.
2. **Mode selection:** Home retains both the selected game and AI/multiplayer mode. The setup modal starts with that selection and resets its game config/stake when reused. Practice starts with zero stake. Online still uses the existing server-provided stake configuration; an explicitly disabled online mode cannot be started from the modal.
3. **Exit controls:** the shared multiplayer HUD has one accessible Exit control; the redundant right-side Quit button is removed. Snooker and Table Tennis keep their own practice exits, while multiplayer retains the shared Exit. Result-screen leave actions remain available.
4. **Sound:** removed the disconnected shared HUD mute buttons rather than keeping an icon that did not mute anything. Existing game-specific audio controls and audio managers remain unchanged.

No wallet, settlement, engine gameplay, API or socket-server production code was edited for these four fixes. Earlier changes to those areas were already in the working tree and were preserved.

## Current verification

| Suite | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Web, including the new feature regressions | 11 | 95 | 0 | 0 |
| Complete game-engine suite | 24 | 333 | 0 | 0 |
| Complete multiplayer suite | 12 | 137 | 0 | 0 |
| **Total** | **47** | **565** | **0** | **0** |

The obsolete engine-only test expecting Android Back confirmation was removed and replaced by tests exercising the actual Capacitor listener. This explains the engine count changing from 334 to 333. The web suite gained 33 tests: navigation/cleanup (16), shared controls (6), mode selection/configuration (8), and native Back (3). These call production components/listeners with controlled external dependencies; they do not start a live two-device match.

Repository typecheck: **PASS across nine workspaces**. Repository build: **PASS**. The pre-existing Vite large-chunk warning remains. `git diff --check`: **PASS**.

The [results manifest](game-feature-fixes-results.json) records test-file totals and current results. Web tests used the existing local node/WebSocket Vitest harness at `/tmp/gaming-hub-bubble-web-vitest.config.mts`, with test-only Supabase values. Engine and multiplayer ran their workspace test commands. Typecheck/build ran from the repository root.

## Browser checks

An isolated localhost preview, disconnected from production API/socket services, verified:

- Table Tennis VS AI opens Practice AI and the Start Practice Game action directly.
- Live Match opens Online PVP and entry stakes.
- Visible Exit opens the confirmation dialog; Cancel stays in the game.
- Browser Back immediately returns from the game to Home without a confirmation dialog.
- Confirmed Exit returns Home without leaving a dialog open.
- At 390×844, Table Tennis has one visible Exit and document width remains 390 pixels.

Multiplayer HUD control ownership and room-cleanup races were verified by automated tests, not a deployed multiplayer UI smoke test. Physical Android/gesture Back and real two-account multiplayer were not tested on devices in this change. No production database was accessed, and no push or deployment was performed.
