# Gaming Hub game and feature recheck

Date: 2026-10-06. Base commit: `31ee31c`. Checked the current working tree, including the uncommitted rematch fixes. **Result: FEATURE ISSUES FOUND.** No production logic was changed for this audit.

Follow-up: the four findings below were subsequently addressed in [game-feature-fixes.md](game-feature-fixes.md). This document retains the original audit evidence; use the follow-up report for the post-fix results.

## Current automated results

| Suite | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Complete game-engine suite | 24 | 334 | 0 | 0 |
| Complete multiplayer suite | 12 | 137 | 0 | 0 |
| Web tests | 7 | 62 | 0 | 0 |
| Selected API game lifecycle/funding/result suites | 6 | 76 | 0 | 0 |
| Selected API tournament/tier/history/persistence/matchmaking/timeout suites | 7 | 202 | 0 | 0 |
| **Existing regression suites** | **56** | **811** | **0** | **0** |
| Temporary test exercising the actual GamePage Exit/Back callbacks | 1 | 1 | 1 | 0 |
| **Including the newly reproduced defect** | **57** | **812** | **1** | **0** |

The targeted failure is an actual behavior mismatch, not a database or runner failure. Passing existing regressions must not be interpreted as all features passing.

Current tournament route total: **61/61**. Current tier-combination total: **93/93**. Typecheck: **PASS across nine workspaces**. Repository build: **PASS**; the existing Vite large-chunk warning remains. Diff whitespace check: **PASS**.

The [results manifest](game-feature-check-results.json) identifies every executed test file. API coverage here is targeted, not the entire API test aggregation or a new full security audit.

## Nine-game coverage

All nine games are present in the shared catalog, frontend GamePage switch, server engine registry and result-adapter registry. The browser catalog shows nine games. Strategy shows Chess, Ludo, Carrom and Snooker.

| Game | Dedicated engine tests passed | Browser practice check |
|---|---:|---|
| Ludo | 6 | Setup, board launch, dice input and Reset Match returning to setup. |
| Chess | 17 | Difficulty/theme controls, board launch, white-at-bottom practice orientation, drag e2–e4, AI reply and chronological `1. e4 Nf6` history. |
| Carrom | 54 | Mobile rules/score display, striker slider moved to 45, shot input and score changing to one captured white coin. Exit confirmation returned home. |
| Snake & Ladder | 6 | Board, countdown, dice controller and player/activity panels rendered. |
| Fruit Ninja | 26 | Classic/Zen setup, game launch, timed result screen, Play Again and confirmed exit. Portrait mode deliberately rotates the play surface. |
| Bubble Shooter | 10 | Mobile grid/launcher, shot input and drop counter changing from two shots to one. |
| Table Tennis | 10 | Mobile header/court, serve button and running rally; Exit opened confirmation and Cancel stayed in game. |
| Snake vs Worms | 9 | Arena, score/result screen and Play Again resetting mass/length. |
| Snooker | 24 | Mobile score/header, vertical table, target/reds, power meter and ball-in-hand state rendered. |

Other engine tests cover shared results, timers, finalization, history and action validation. Multiplayer tests cover readiness, queue matching, sync/versioning, reconnect, cleanup and rematches for all nine games. Actual HTTP/Prisma funding tests cover paid starts and rematches, duplicate requests, insufficient funds rollback and competing starts.

These are launch/sample-interaction checks, not complete manual playthroughs. Dragging a chess piece was verified; every input variant, difficulty, theme, terminal outcome and physical mobile device was not manually exercised.

## Defects and proposed corrections

### 1. Multiplayer Back still opens confirmation — priority 1

`apps/web/src/pages/Games/GamePage.tsx:33` pushes an extra history entry and registers `popstate` during active multiplayer. Its handler pushes another entry and calls `setShowExitConfirm(true)`. This conflicts with the requested direct browser/native/gesture Back behavior. The native Capacitor listener uses normal router navigation, but that navigation still encounters this GamePage interceptor.

The temporary test executed the real component's effect and callback: visible Exit correctly requests confirmation; simulated browser Back incorrectly requests it too. The [reproduction fixture](game-back-reproduction.test.txt) is retained as text rather than leaving an intentional failing test in the normal test discovery path. To reproduce, place it temporarily at `apps/web/src/pages/Games/GamePage.back.audit.test.tsx` and run the web Vitest harness.

Correction: separate visible Exit from history navigation, remove the game-specific history trap, and verify route cleanup leaves/stops multiplayer exactly once. Keep financial settlement server-authoritative. Also review the shared `beforeunload` guard for cross-document navigation; an automated full-document navigation was aborted during practice checks, so it must not be confused with the successful same-app practice Back check.

### 2. Home “VS AI” opens multiplayer setup — priority 2

`GameCard.tsx:77` passes mode `ai`, but `Home.tsx:328` and `Home.tsx:353` discard that argument and only set the game. `MatchSetupModal.tsx:17` initializes mode to `multiplayer`. Browser reproduction: tapping the Table Tennis VS AI card opened entry stakes and “MATCH & PLAY NOW”; selecting Practice AI manually was necessary.

Correction: retain the clicked mode when opening the modal and initialize/reset its selection from that value. Preserve the existing stake validation and server-owned online entry flow.

### 3. Shared multiplayer HUD still has two leave controls — priority 2, source review

`GameWrapper.tsx:125` renders the left Lobby control and `GameWrapper.tsx:192` renders Quit Game; both call the same exit handler. Some games also provide their own exit control. The practice Snooker/Table Tennis duplicate controls were removed, but the generic multiplayer branch still needs a single-owner rule.

Correction: designate one visible exit control per game/viewport and preserve the existing confirmation/cleanup handler. This branch was source-reviewed; a deployed two-client UI reproduction was not performed.

### 4. Shared HUD mute control is cosmetic — priority 3, source review

`GameWrapper.tsx:185` and `GameWrapper.tsx:270` only toggle local `isMuted` and the icon. That state is not passed to children or an audio service. Games may have separate working sound controls, but the shared HUD control does not mute their audio.

Correction: connect it to the game's existing audio manager or omit the redundant control. Do not introduce another independent sound state.

## Coverage gaps

- The legacy `confirmation-popups-safety.test.ts` simulates local helper functions and still expects Android Back confirmation. It does not exercise the production GamePage behavior and needs replacement with current component/navigation tests when the defect is fixed.
- Real two-account deployed multiplayer, mobile hardware/gesture Back, multi-replica sockets and external settlement-provider flows were not smoke-tested in this recheck. Automated server tests are not a substitute for those checks.
- Mobile visual checks sampled a 390×844 preview for Table Tennis, Snooker, Carrom, Bubble Shooter, Ludo and Chess. No horizontal document overflow was observed in measured Table Tennis, Carrom, Bubble Shooter or Chess views. This does not prove every viewport or every game screen.

## Cricket and environment safety

No active Cricket registration, engine, route import or gameplay asset was found in the checked runtime source. Remaining references are legacy history types/statistics and the “Cricket — no longer available” history display. Opening `/games/cricket` in the isolated preview redirected home without starting a game.

Browser checks used an isolated local Vite preview with test-only Supabase and unavailable local API/socket URLs. Expected settings/support fetch errors from that disconnected preview were not classified as production defects. PostgreSQL tests used only disposable `127.0.0.1:5541/gaming_hub_match_start_20261006_test`. An initial run reached PostgreSQL before startup completed and executed zero tests; readiness was verified and the reported rerun passed.

No production data was accessed, no application feature code was edited, and no commit, push or deployment was performed. Existing developer services were left untouched.
