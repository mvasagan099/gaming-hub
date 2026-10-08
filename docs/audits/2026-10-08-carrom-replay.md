# Carrom and replay audit — 2026-10-08

Request: check Carrom gameplay and the slowdown when restarting a finished game or opening a saved match replay. User confirmed both replay paths are affected.

## Repairs

- AI Carrom now cancels both its aiming and delayed-shot timers on cleanup. Replay resets aim, queen status, thinking status, turn guards, pieces and transient visual effects.
- Completed AI and multiplayer boards stop scheduling animation frames. Multiplayer cleanup also cancels its shot settlement timeout and terminates the prediction worker.
- Foul refunds no longer mutate pieces/rules inside a React state updater. Scores come from the settled board. Repeated updater checks cannot consume a debt twice or leave the displayed score inconsistent with returned pieces.
- Queen plus an own coin in the same shot covers the queen. A striker foul returns the queen. A pending cover cannot finish the match. The winner must have covered the queen. Game completion happens after shot and pocket animations settle, without an untracked delayed game-over callback.
- AI prioritizes the queen before its last black coin, and passes a turn with no eligible target rather than remaining stuck in thinking status.
- Replay fetches have cancellation and a 20-second deadline; changing matches resets data and playback. Late responses cannot update a closed viewer. Incomplete packages produce a load error.
- Replay event details are memoized and bounded before JSON serialization. Long trajectories cannot create a huge DOM text node. Details are collapsed by default.
- Saved Carrom replay now has a recorded board. It interpolates recorded positions, supports pause/resume and speed changes without rewinding a shot, stops rendering when paused/completed/closed, and shows settled positions when seeking. It starts no live game driver or physics simulation.
- Tournament replay URLs open the saved viewer instead of mounting an AI game.
- Distributed completion archives a Replay row in the same fenced PostgreSQL transaction as the checkpoint and result outbox. It preserves action history, initial Carrom board, settled action states and one copy of each shot trajectory. The archive remains unchanged when a room rematches.
- Distributed servers no longer keep a second unbounded ReplayManager recording. They retain only the latest verification snapshot; recovery continues to use the canonical checkpoint and action history. Live shot broadcasts retain both existing event formats.

## Verification

- Web: full suite, 263 tests across 37 files.
- Game engine: full suite, 421 tests across 27 files, including Carrom physics/rules/sync/pockets.
- Multiplayer: full suite, 209 tests across 20 files, including actual private-room socket flows.
- Actual API/two-replica recovery: 9 games tested with owner process termination, identity restoration, duplicate-action handling, funded rematch, replay retention, unauthorized replay rejection and exactly-once settlement. Carrom additionally executes and archives a real strike trajectory.
- An earlier focused Carrom run also passed failed-board-load refund and invalid private-room admission checks (3 tests).
- All-workspace typecheck and production builds passed. Web typecheck/build rerun after the final AI rules changes.
- Browser smoke check used synthetic local replay data: full board visible, recorded shot playback, completion, speed control, close, and no browser console errors. This is not a measured FPS benchmark or production paid playthrough.

The API tests used only the isolated localhost test PostgreSQL database on port 5541 and Redis on port 56479. Production .env database configuration was never used by the test runner. No production matches, wallet transfers, schema migrations or deployment were performed.

## Limits / delivery

Older matches that never stored a replay or canonical action history cannot recover their missing trajectories. Their existing move-only fallback remains available; these fixes preserve full Carrom data for newly completed distributed matches. Other games retain their existing action replay viewer.

Existing large production-build chunks remain; this change does not claim to fix every device/network performance limitation. Changes are local, uncommitted and unpushed. Existing unrelated workspace changes were preserved.
