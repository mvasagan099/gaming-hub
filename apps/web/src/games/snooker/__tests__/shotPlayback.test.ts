import { describe, expect, it, vi } from 'vitest';
import { SnookerEngine, SNOOKER_KEYFRAME_MS, simulateSnookerShot, snookerShotDuration } from '../../../../../../packages/game-engine/src/snooker';
import { SnookerShotPlayback } from '../shotPlayback';
const fresh = () => new SnookerEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]).state;
function fixture() {
  const render = vi.fn(), settle = vi.fn();
  const player = new SnookerShotPlayback({ render, settle });
  const state = fresh();
  const frames = [0, 1, 2].map(frame => ({ frame, pieces: state.balls.map(b => ({ id: b.id, x: b.x + frame * 10, y: b.y, pocketed: false, pocketIndex: null })) }));
  const result = { ...state, stateVersion: 2, lastProcessedShotId: 'shot', keyframes: frames };
  return { player, render, settle, state, frames, result };
}
describe('Snooker shot playback and reconciliation', () => {
  it('shows predicted motion before the network reply and waits for authoritative scoring', () => {
    const { player, render, settle, state, frames, result } = fixture();
    player.begin('shot', state.balls, 100); player.preview('shot', frames);
    player.advance(100 + SNOOKER_KEYFRAME_MS / 2);
    expect(render.mock.calls.at(-1)![0][0].x).toBe(state.balls[0].x + 5);
    expect(settle).not.toHaveBeenCalled();
    player.advance(500); expect(player.busy).toBe(true);
    player.receive(result, 500); expect(settle).toHaveBeenCalledExactlyOnceWith(result);
    expect(player.busy).toBe(false);
  });
  it('does not restart or snap an active shot on repeated server delivery', () => {
    const { player, render, settle, result, state } = fixture();
    player.receive(result, 100); player.advance(108);
    player.receive(result, 112); player.advance(116);
    expect(settle).not.toHaveBeenCalled();
    expect(render.mock.calls.at(-1)![0][0].x).toBeCloseTo(state.balls[0].x + 9.6);
    player.advance(140); expect(settle).toHaveBeenCalledOnce();
    player.receive(result, 200); expect(player.busy).toBe(false);
  });
  it.each([30, 60, 144])('samples identical positions and duration at a %s Hz refresh rate', hz => {
    const { player, render, result, state } = fixture();
    player.receive(result, 0);
    for (let t = 0; t < 25; t += 1000 / hz) player.advance(t);
    player.advance(25);
    expect(render.mock.calls.at(-1)![0][0].x).toBeCloseTo(state.balls[0].x + 15);
    player.advance(40); expect(player.busy).toBe(false);
  });
  it('cancels old preview replies on reconnect, rollback, or a new match', () => {
    const { player, render, settle, state, frames, result } = fixture();
    player.begin('shot', state.balls, 0);
    player.receive(result, 1, true);
    player.preview('shot', frames); player.advance(10);
    expect(render).not.toHaveBeenCalled(); expect(settle).toHaveBeenCalledExactlyOnceWith(result);
    player.begin('rematch-shot', state.balls, 20); player.preview('shot', frames);
    player.advance(21); expect(render).not.toHaveBeenCalled();
    player.cancel(state); expect(player.busy).toBe(false);
  });
  it('predicts the same trajectory that the authoritative engine publishes', () => {
    const engine = new SnookerEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]);
    const params = { angle: 0.2, power: 0.6, spinX: 0.2, spinY: -0.2 };
    const preview = simulateSnookerShot(engine.state.balls, params);
    const response = engine.apply({ type: 'strike', ...params, shotId: 'predicted' }, 0);
    expect(response.ok).toBe(true); expect(engine.state.keyframes).toEqual(preview.keyframes);
    expect(snookerShotDuration(preview.keyframes)).toBeGreaterThan(0);
  });
});
