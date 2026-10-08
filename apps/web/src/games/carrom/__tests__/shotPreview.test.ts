import { describe, expect, it } from 'vitest';
import { CarromEngine } from '@gaming-hub/game-engine';
import { predictCarromShot, authoritativeShotStart } from '../shotPreview';

describe('Immediate Carrom shot preview', () => {
  for (const seat of [0, 1]) {
    it.each([{ angle: Math.PI * 1.5, power: 0.2, x: 280 }, { angle: 0.8, power: 0.5, x: 330 }, { angle: 2.8, power: 1, x: 450 }])(
      `matches authoritative physics from seat ${seat} for %j`, action => {
        const engine = new CarromEngine([{ seat: 0, userId: 'p0' }, { seat: 1, userId: 'p1' }], () => 0.5, { now: () => 1000 });
        engine.state.currentSeat = seat;
        const before = engine.serialize();
        const preview = predictCarromShot(engine.state, seat, action);
        expect(engine.serialize()).toEqual(before);
        const result = engine.apply({ type: 'strike', ...action }, seat);
        expect(result.ok).toBe(true);
        expect(preview).toEqual(engine.state.lastTrajectory);
      },
    );
  }
});


it('uses server-confirmed shot age without depending on the client clock', () => {
  expect(authoritativeShotStart({ lastActionAtMs: 1000, serverTimestamp: 1700 }, 5000)).toBe(4300);
  expect(authoritativeShotStart({ lastActionAtMs: 1000, serverTimestamp: 900 }, 5000)).toBe(5000);
  expect(authoritativeShotStart({ lastActionAtMs: null, serverTimestamp: 1700 }, 5000)).toBe(5000);
});
