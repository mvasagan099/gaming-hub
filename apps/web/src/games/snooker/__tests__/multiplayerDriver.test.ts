import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SnookerEngine } from '../../../../../../packages/game-engine/src/snooker';
const fixture = vi.hoisted(() => ({ state: {} as any, listener: null as any, aim: null as any, send: vi.fn(), sync: vi.fn(), on: vi.fn(), off: vi.fn(), emit: vi.fn() }));
vi.mock('../../../store/multiplayerStore', () => ({ useMultiplayerStore: {
  getState: () => fixture.state,
  subscribe: (fn: any) => { fixture.listener = fn; return () => { fixture.listener = null; }; },
} }));
import Driver from '../SnookerMultiplayerDriver';
let driver: Driver;
const update = (patch: any) => { const prev = fixture.state; fixture.state = { ...prev, ...patch }; fixture.listener?.(fixture.state, prev); };
const snapshot = () => new SnookerEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]).state;
const hydrate = vi.fn(), animate = vi.fn(), remoteAim = vi.fn();
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(100000); vi.clearAllMocks();
  fixture.send.mockResolvedValue({ ok: true }); fixture.sync.mockResolvedValue(undefined);
  fixture.on.mockImplementation((_: any, fn: any) => { fixture.aim = fn; });
  fixture.state = { room: { id: 'room', matchId: 'match' }, matchId: 'match', status: 'connected',
    socket: { on: fixture.on, off: fixture.off, emit: fixture.emit }, gameState: snapshot(), renderKey: 1, winner: null,
    sendGameAction: fixture.send, requestFullStateSync: fixture.sync };
  driver = new Driver(0, hydrate, animate, remoteAim, { roomId: 'room', matchId: 'match' }); driver.start();
});
afterEach(() => { driver.stop(); vi.useRealTimers(); });
describe('Snooker multiplayer delivery', () => {
  it('hydrates without replaying an old shot and animates each live shot once', () => {
    const state = { ...snapshot(), stateVersion: 2, lastProcessedShotId: 'shot', keyframes: [{ frame: 0, pieces: [] }] };
    update({ gameState: state, renderKey: 2 }); expect(animate).toHaveBeenCalledOnce();
    update({ gameState: { ...state, lastActionAtMs: Date.now() + 100 }, renderKey: 3 }); expect(animate).toHaveBeenCalledOnce();
    driver.stop(); driver = new Driver(0, hydrate, animate, remoteAim); driver.start();
    expect(animate).toHaveBeenCalledOnce(); expect(hydrate).toHaveBeenLastCalledWith(fixture.state.gameState, true);
  });
  it('binds strikes to the latest engine version and prevents simultaneous actions', async () => {
    let finish!: (value: any) => void;
    fixture.send.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = driver.sendStrike(0.2, 0.6, 0, 0, 'shot');
    expect(fixture.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'strike', shotId: 'shot', expectedStateVersion: 1 }));
    expect((await driver.sendStrike(0.2, 0.6)).ok).toBe(false);
    finish({ ok: false, error: 'Rejected' }); await pending;
    expect(driver.canAct()).toBe(true);
  });
  it('rejects spectators, disconnected players, moving balls, and old matches', async () => {
    update({ gameState: { ...snapshot(), shotPlaybackEndsAtMs: Date.now() + 1000 }, renderKey: 2 });
    expect((await driver.sendStrike(0, 0.5)).ok).toBe(false);
    update({ gameState: snapshot(), renderKey: 3, status: 'reconnecting' });
    expect((await driver.sendPlaceCueBall(150, 240)).ok).toBe(false);
    update({ status: 'connected' }); expect(fixture.sync).toHaveBeenCalledOnce();
    update({ gameState: snapshot(), renderKey: 4 }); expect(driver.canAct()).toBe(true);
    update({ matchId: 'other', renderKey: 5 }); expect((await driver.sendStrike(0, 0.5)).ok).toBe(false);
    driver.stop(); driver = new Driver(null, hydrate, animate, remoteAim); driver.start();
    expect((await driver.sendStrike(0, 0.5)).ok).toBe(false); expect(fixture.send).not.toHaveBeenCalled();
  });
  it('filters remote aim by match, room, turn and sequence, resetting sequence each turn', () => {
    update({ gameState: { ...snapshot(), currentSeat: 1, currentPlayer: 1 }, renderKey: 2 });
    const aim = { roomId: 'room', matchId: 'match', seat: 1, turnNumber: 0, angle: 0.4, power: 0.6, sequence: 50 };
    fixture.aim({ ...aim, matchId: 'old' }); fixture.aim({ ...aim, angle: Infinity }); fixture.aim({ ...aim, turnNumber: 10 });
    expect(remoteAim).not.toHaveBeenCalled(); fixture.aim(aim); fixture.aim(aim); expect(remoteAim).toHaveBeenCalledOnce();
    update({ gameState: { ...fixture.state.gameState, turnNumber: 1 }, renderKey: 3 });
    fixture.aim({ ...aim, turnNumber: 1, sequence: 1 }); expect(remoteAim).toHaveBeenCalledTimes(2);
  });
  it('detaches listeners from the original socket and blocks actions after stop', async () => {
    driver.start(); expect(fixture.on).toHaveBeenCalledOnce();
    driver.stop(); expect(fixture.off).toHaveBeenCalledOnce();
    expect((await driver.sendStrike(0, 0.5)).ok).toBe(false); expect(fixture.send).not.toHaveBeenCalled();
  });
  it('uses the server clock offset when waiting for a shot to settle', () => {
    update({ gameState: { ...snapshot(), serverTimestamp: 5000, shotPlaybackEndsAtMs: 6000 }, renderKey: 2 });
    expect(driver.canAct()).toBe(false);
    vi.advanceTimersByTime(1001); expect(driver.canAct()).toBe(true);
  });
  it('restores a paused shot without replaying it and blocks remote aiming while paused', () => {
    const state = { ...snapshot(), currentSeat: 1, currentPlayer: 1, stateVersion: 2,
      lastProcessedShotId: 'shot', keyframes: [{ frame: 0, pieces: [] }] };
    update({ gameState: state, renderKey: 2 }); expect(animate).toHaveBeenCalledOnce();
    update({ gameState: { ...state, paused: true }, renderKey: 3 });
    expect(hydrate).toHaveBeenLastCalledWith(fixture.state.gameState, true);
    fixture.aim({ roomId: 'room', matchId: 'match', seat: 1, turnNumber: 0, angle: 0.4, power: 0.6, sequence: 1 });
    expect(remoteAim).not.toHaveBeenCalled();
    update({ gameState: { ...state, paused: false }, renderKey: 4 });
    expect(animate).toHaveBeenCalledOnce();
  });
});
