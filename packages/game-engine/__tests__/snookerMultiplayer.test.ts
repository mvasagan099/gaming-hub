import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SnookerEngine } from '../src/snooker';
let engine: SnookerEngine;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100000); engine = new SnookerEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]); });
afterEach(() => vi.useRealTimers());
const shot = () => engine.apply({ type: 'strike', angle: 0.1, power: 0.5, shotId: 'shot' }, 0);
describe('Snooker multiplayer lifecycle regressions', () => {
  it('reserves playback time before giving the next player their full turn', () => {
    expect(shot().ok).toBe(true);
    expect(engine.state.shotPlaybackEndsAtMs).toBeGreaterThan(Date.now());
    expect(engine.currentClockDeadline).toBe(engine.state.shotPlaybackEndsAtMs + 20000);
    const seat = engine.currentSeat;
    expect(engine.apply({ type: 'strike', angle: 0, power: 0.5, shotId: 'overlap' }, seat).ok).toBe(false);
    expect(engine.apply({ type: 'timeout' }, seat).ok).toBe(false);
    vi.setSystemTime(engine.state.shotPlaybackEndsAtMs + 1);
    expect(engine.apply({ type: 'strike', angle: 0, power: 0.5, shotId: 'next' }, seat).error).not.toBe('Wait for the balls to settle');
  });
  it('does not permit moving the cue without ball-in-hand or placing non-finite coordinates', () => {
    expect(engine.apply({ type: 'place-cue-ball', x: 150, y: 240 }, 0).ok).toBe(false);
    engine.state.cueBallInHand = true; engine.state.inBaulkOnly = true;
    expect(engine.apply({ type: 'place-cue-ball', x: NaN, y: 240 }, 0).ok).toBe(false);
    expect(engine.apply({ type: 'place-cue-ball', x: 195, y: 240 }, 0).ok).toBe(false);
    expect(engine.apply({ type: 'place-cue-ball', x: 160, y: 240 }, 0).ok).toBe(true);
    expect(engine.state.cueBallInHand).toBe(false);
  });
  it('clears old trajectories on cue placement, nomination, and turn timeout', () => {
    shot(); vi.setSystemTime(engine.state.shotPlaybackEndsAtMs + 1);
    const seat = engine.currentSeat;
    engine.state.cueBallInHand = true; engine.state.inBaulkOnly = true;
    expect(engine.apply({ type: 'place-cue-ball', x: 150, y: 240 }, seat).ok).toBe(true);
    expect(engine.state.keyframes).toEqual([]);
    engine.state.frameStatus = 'COLOR_PHASE';
    expect(engine.apply({ type: 'nominate-color', color: 'cue' }, seat).ok).toBe(false);
    expect(engine.apply({ type: 'nominate-color', color: 'blue' }, seat).ok).toBe(true);
    expect(engine.state.keyframes).toEqual([]);
    expect(engine.apply({ type: 'timeout' }, seat).ok).toBe(false);
    vi.setSystemTime(engine.currentClockDeadline! + 1);
    expect(engine.apply({ type: 'timeout' }, seat).ok).toBe(true);
    expect(engine.state.keyframes).toEqual([]);
    expect(engine.state.player1Score + engine.state.player2Score).toBeGreaterThanOrEqual(4);
  });
  it('blocks malformed shots, invalid seats and premature next frames without corrupting state', () => {
    const before = structuredClone(engine.state);
    for (const angle of [NaN, Infinity, -Infinity]) expect(engine.apply({ type: 'strike', angle, power: 0.5 }, 0).ok).toBe(false);
    expect(engine.apply({ type: 'resign' }, 99).ok).toBe(false);
    expect(engine.apply({ type: 'next-frame' }, 0).ok).toBe(false);
    expect(engine.state).toEqual(before);
  });
  it('keeps duplicate shot retries idempotent and bound to the original player', () => {
    shot(); const version = engine.state.stateVersion;
    expect(shot().ok).toBe(true); expect(engine.state.stateVersion).toBe(version);
    expect(engine.apply({ type: 'strike', angle: 0, power: 0.5, shotId: 'shot' }, 1).ok).toBe(false);
  });
  it('serializes a stable snapshot and can roll rejected actions back', () => {
    const before = structuredClone(engine.state), snapshot = engine.serialize();
    shot(); expect(snapshot.balls).toEqual(before.balls);
    engine.restoreState(before); expect(engine.state).toEqual(before);
    expect(engine.serialize()).toMatchObject({ serverTimestamp: Date.now(), turnDeadlineMs: 120000, turnDurationMs: 20000 });
  });
  it('resigns from either seat and shows match completion rather than another frame', () => {
    expect(engine.apply({ type: 'resign' }, 1).winnerSeats).toEqual([0]);
    expect(engine.state.frameStatus).toBe('MATCH_END');
    expect(engine.apply({ type: 'next-frame' }, 0).ok).toBe(false);
  });
  it('shows a tied match timeout as a draw with no next-frame action', () => {
    const result = engine.handleTimeout('match');
    expect(result.winnerSeats).toEqual([]); expect(engine.state.frameStatus).toBe('MATCH_END');
    expect(engine.currentClockDeadline).toBeNull();
  });
  it('resets clocks after delayed funding and clears identities for subsequent frames', () => {
    vi.advanceTimersByTime(30000); engine.startMatchClock();
    expect(engine.currentClockDeadline).toBe(150000); expect(engine.currentMatchDeadline).toBe(730000);
    engine = new SnookerEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }], undefined, { bestOf: 3 });
    engine.apply({ type: 'concede' }, 0);
    expect(engine.apply({ type: 'next-frame' }, 1).ok).toBe(true);
    expect(engine.state).toMatchObject({ frameNumber: 2, lastProcessedShotId: null, frameWinnerSeats: [], shotPlaybackEndsAtMs: 0 });
  });
  it('freezes both clocks during a reconnect and resumes with the same remaining turn', () => {
    vi.advanceTimersByTime(5000); engine.pauseClocks();
    expect(engine.currentClockDeadline).toBeNull(); expect(engine.currentMatchDeadline).toBeNull();
    vi.advanceTimersByTime(30000);
    expect((engine.serialize().turnDeadlineMs as number) - Date.now()).toBe(15000);
    expect(engine.apply({ type: 'strike', angle: 0, power: 0.5 }, 0).ok).toBe(false);
    expect(engine.handleTimeout('turn').ok).toBe(false);
    engine.resumeClocks(); expect(engine.currentClockDeadline).toBe(150000);
    expect(engine.currentMatchDeadline).toBe(730000);
  });
  it('clears the previous colour nomination and target when a turn times out', () => {
    engine.state.frameStatus = 'COLOR_PHASE'; engine.state.targetBall = 'COLOR';
    engine.state.nominatedBall = 'black'; engine.state.freeBallAvailable = true; engine.state.freeBallTarget = 'RED';
    engine.handleTimeout('turn', 0);
    expect(engine.state).toMatchObject({ currentSeat: 1, targetBall: 'RED', frameStatus: 'RED_PHASE',
      nominatedBall: null, freeBallAvailable: false, freeBallTarget: null });
    engine.state.balls.forEach(b => { if (b.type === 'red') b.pocketed = true; });
    engine.state.frameStatus = 'COLOR_PHASE'; engine.state.targetBall = 'COLOR'; engine.state.isColorAfterFinalRed = true;
    engine.handleTimeout('turn', 1);
    expect(engine.state).toMatchObject({ targetBall: 'YELLOW', frameStatus: 'COLOR_CLEARANCE', isColorAfterFinalRed: false });
  });
});
