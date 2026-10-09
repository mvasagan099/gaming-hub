import { afterEach, describe, expect, it, vi } from 'vitest';
import { packCarromTrajectory, unpackCarromState } from '@gaming-hub/shared';
import { CarromEngine } from '../src/carrom/engine';
describe('lossless Carrom shot wire representation', () => {
  afterEach(() => vi.useRealTimers());
  it('preserves every frame, coordinate, pocket, ID and recovery snapshot', () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const engine = new CarromEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]);
    expect(engine.apply({ type: 'place-striker', x: 200 }, 0).ok).toBe(true);
    expect(engine.apply({ type: 'strike', x: 200, angle: -Math.PI / 2, power: 0.35 }, 0).ok).toBe(true);
    const full = engine.serialize(); const wire = engine.serializeForSync(true);
    expect({ ...unpackCarromState(wire), serverTimestamp: full.serverTimestamp }).toEqual(full);
    expect(JSON.stringify(wire).length).toBeLessThan(JSON.stringify(full).length * 0.65);
    expect(engine.serialize().lastTrajectory).toEqual(full.lastTrajectory);
    expect(engine.serializeForSync(false).trajectoryOmitted).toBe(true);
    expect(unpackCarromState(full)).toBe(full);
  });
  it('supports changing piece order and fractional coordinates without rounding', () => {
    const a = { id: 'a', x: 1.234567, y: -2.5, pocketed: false, pocketIndex: null };
    const b = { id: 'b', x: 99.01, y: 90, pocketed: true, pocketIndex: 3 };
    const frames = [{ frame: 0, pieces: [a, b] }, { frame: 7, pieces: [b, a] }];
    expect(unpackCarromState({ packedCarromTrajectory: packCarromTrajectory(frames) as any }).lastTrajectory).toEqual(frames);
  });
});
