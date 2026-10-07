import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { SnakeVsWormsEngine } from '@gaming-hub/game-engine';
const fixture = vi.hoisted(() => ({ store: {} as any, listener: null as any, send: vi.fn(), sync: vi.fn() }));
vi.mock('../../../store/multiplayerStore', () => ({ useMultiplayerStore: {
  getState: () => fixture.store, subscribe: (cb: any) => { fixture.listener = cb; return () => { fixture.listener = null; }; },
} }));
import { SnakeVsWormsMultiplayerDriver as Driver } from '../SnakeVsWormsMultiplayerDriver';
const update = (patch: any) => { const old = fixture.store; fixture.store = { ...old, ...patch }; fixture.listener?.(fixture.store, old); };
let driver: Driver;
const render = vi.fn(), complete = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); fixture.send.mockResolvedValue({ ok: true }); fixture.sync.mockResolvedValue(undefined);
  fixture.store = { room: { id: 'room', gameId: 'snake-vs-worms' }, matchId: 'match', status: 'connected', renderKey: 1,
    gameState: new SnakeVsWormsEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]).serialize(),
    sendGameAction: fixture.send, requestFullStateSync: fixture.sync };
  driver = new Driver(0, []); driver.setOnStateUpdate(render); driver.setOnMatchComplete(complete); driver.start();
});
afterEach(() => driver.stop());
describe('Snake vs Worms multiplayer delivery', () => {
  it('subscribes once and ignores unrelated room updates and older engine states', () => {
    driver.start(); update({ room: { ...fixture.store.room, code: 'ABCDE' } }); expect(render).toHaveBeenCalledOnce();
    update({ renderKey: 2, gameState: { ...fixture.store.gameState, stateVersion: 5 } });
    update({ renderKey: 3, gameState: { ...fixture.store.gameState, stateVersion: 4 } }); expect(render).toHaveBeenCalledTimes(2);
  });
  it('deduplicates steering without resending it on every physics snapshot', async () => {
    driver.sendDirection('up'); await Promise.resolve();
    update({ renderKey: 2, gameState: { ...fixture.store.gameState, stateVersion: 2 } });
    driver.sendDirection('up'); expect(fixture.send).toHaveBeenCalledOnce();
    driver.sendDirection('left'); expect(fixture.send).toHaveBeenCalledOnce();
  });
  it('allows failed directions and boosts to be retried, and releases boost on stop', async () => {
    fixture.send.mockResolvedValueOnce({ ok: false }); driver.sendDirection('up'); await Promise.resolve();
    driver.sendDirection('up'); expect(fixture.send).toHaveBeenCalledTimes(2);
    fixture.send.mockRejectedValueOnce(new Error('offline')); driver.sendBoostStart(); await Promise.resolve(); await Promise.resolve();
    driver.sendBoostStart(); expect(fixture.send).toHaveBeenLastCalledWith({ type: 'boost-start' });
    driver.stop(); expect(fixture.send).toHaveBeenLastCalledWith({ type: 'boost-stop' });
  });
  it('blocks input while disconnected until fresh synchronization, and on old matches', () => {
    update({ status: 'reconnecting' }); driver.sendDirection('up'); expect(fixture.send).not.toHaveBeenCalled();
    update({ status: 'connected' }); expect(fixture.sync).toHaveBeenCalledOnce();
    driver.sendDirection('up'); expect(fixture.send).not.toHaveBeenCalled();
    update({ renderKey: 2, gameState: { ...fixture.store.gameState, stateVersion: 2 } });
    driver.sendDirection('up'); expect(fixture.send).toHaveBeenCalledOnce();
    update({ matchId: 'other' }); driver.sendBoostStart(); expect(fixture.send).toHaveBeenCalledOnce();
  });
  it('shows resignations and draws exactly once, including initial finished hydration', () => {
    const finished = { ...fixture.store.gameState, finished: true, winnerSeats: [], stateVersion: 2 };
    update({ renderKey: 2, gameState: finished }); update({ renderKey: 3, gameState: finished });
    expect(complete).toHaveBeenCalledExactlyOnceWith(null);
    driver.stop(); driver = new Driver(0, []); driver.setOnMatchComplete(complete); driver.start();
    expect(complete).toHaveBeenCalledTimes(2);
  });
  it('lets spectators observe while preventing gameplay input', () => {
    driver.stop(); driver = new Driver(null, []); driver.setOnStateUpdate(render); driver.start();
    fixture.send.mockClear(); driver.sendDirection('up'); driver.sendBoostStart(); expect(fixture.send).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(2);
  });
  it('does not let offline snapshots unlock controls after reconnect', () => {
    update({ status: 'reconnecting' });
    update({ renderKey: 2, gameState: { ...fixture.store.gameState, stateVersion: 2 } });
    update({ status: 'connected' });
    driver.sendDirection('up'); expect(fixture.send).not.toHaveBeenCalled();
    update({ renderKey: 3, gameState: { ...fixture.store.gameState, stateVersion: 3 } });
    driver.sendDirection('up'); expect(fixture.send).toHaveBeenCalledOnce();
  });
  it('allows boost to restart after releasing it while paused', async () => {
    driver.sendBoostStart(); await Promise.resolve();
    update({ renderKey: 2, gameState: { ...fixture.store.gameState, paused: true, stateVersion: 2 } });
    driver.sendBoostStop();
    update({ renderKey: 3, gameState: { ...fixture.store.gameState, paused: false, stateVersion: 3 } });
    driver.sendBoostStart();
    expect(fixture.send.mock.calls.filter(([action]) => action.type === 'boost-start')).toHaveLength(2);
  });
  it('ignores a delayed rejection from an earlier identical turn', async () => {
    let rejectOld!: (value: any) => void;
    fixture.send.mockImplementationOnce(() => new Promise(resolve => { rejectOld = resolve; }));
    driver.sendDirection('up'); driver.sendDirection('down'); driver.sendDirection('up');
    rejectOld({ ok: false }); await Promise.resolve();
    driver.sendDirection('up'); expect(fixture.send).toHaveBeenCalledTimes(3);
  });
  it('sends a quick return to the original direction while the first turn is pending', () => {
    fixture.send.mockImplementationOnce(() => new Promise(() => {}));
    driver.sendDirection('up'); driver.sendDirection('right');
    expect(fixture.send).toHaveBeenLastCalledWith({ type: 'direction', direction: 'right' });
    expect(fixture.send).toHaveBeenCalledTimes(2);
  });
});
