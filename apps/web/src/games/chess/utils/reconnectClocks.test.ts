import { describe, expect, it } from 'vitest';
import { ChessEngine, CarromEngine } from '@gaming-hub/game-engine';
import { liveRemainingMs } from './chessReactUtils';
import { remainingCarromTurnMs } from '../../carrom/carromClock';

describe('Server clock snapshots during reconnect', () => {
  const players = [{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }];
  it('Chess displays the same paused budget and resumes its countdown', () => {
    let now = 100000;
    const engine = new ChessEngine(players, undefined, { now: () => now, timeControl: { baseSeconds: 60, incrementSeconds: 0, delaySeconds: 0 } });
    void engine.state; now += 5000; engine.pauseClocks();
    const frozen = engine.serialize() as any;
    now += 10000;
    expect(liveRemainingMs(frozen.clocks['0'], now, frozen.paused)).toBe(55000);
    engine.resumeClocks(); const resumed = engine.serialize() as any;
    expect(liveRemainingMs(resumed.clocks['0'], now + 1000, resumed.paused)).toBe(54000);
  });
  it('Carrom displays the server pause budget instead of draining in animation frames', () => {
    let now = 100000;
    const engine = new CarromEngine(players, undefined, { now: () => now });
    void engine.state; now += 5000; engine.pauseClocks();
    const frozen = engine.serialize() as any;
    now += 10000;
    expect(remainingCarromTurnMs(frozen.turnExpiresAt, now, frozen.pausedAtMs)).toBe(25000);
    engine.resumeClocks(); const resumed = engine.serialize() as any;
    expect(remainingCarromTurnMs(resumed.turnExpiresAt, now + 1000, resumed.pausedAtMs)).toBe(24000);
  });
});
