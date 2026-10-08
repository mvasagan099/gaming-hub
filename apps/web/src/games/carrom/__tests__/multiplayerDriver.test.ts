import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CarromEngine } from '@gaming-hub/game-engine';
const actions = vi.hoisted(() => ({ send: vi.fn(), subscribe: vi.fn((_listener: (state: any, prev: any) => void) => vi.fn()), state: {} as any }));
vi.mock('../../../store/multiplayerStore', () => ({ useMultiplayerStore: { subscribe: actions.subscribe, getState: () => ({ ...actions.state, sendGameAction: actions.send }) } }));
vi.mock('../../../store/authStore', () => ({ useAuthStore: { getState: () => ({ user: { id: 'test' } }) } }));
import Driver from '../CarromMultiplayerDriver';
beforeEach(() => { vi.clearAllMocks(); actions.state = { matchId: 'match', room: { id: 'room' } }; });

describe('Carrom multiplayer action delivery', () => {
  it('moves the preview listener to a replaced socket and removes it on stop', () => {
    const oldSocket = { on: vi.fn(), off: vi.fn() };
    const newSocket = { on: vi.fn(), off: vi.fn() };
    actions.state.socket = oldSocket;
    const driver = new Driver(0, []);
    driver.start();
    const listener = oldSocket.on.mock.calls[0][1];
    const notify = actions.subscribe.mock.calls[0][0] as any;
    const previous = { ...actions.state };
    actions.state.socket = newSocket;
    notify(actions.state, previous);
    expect(oldSocket.off).toHaveBeenCalledWith('carrom:striker-position', listener);
    expect(newSocket.on).toHaveBeenCalledExactlyOnceWith('carrom:striker-position', listener);
    notify(actions.state, actions.state);
    expect(newSocket.on).toHaveBeenCalledOnce();
    driver.stop();
    expect(newSocket.off).toHaveBeenCalledExactlyOnceWith('carrom:striker-position', listener);
  });

  it('renders a reconnect snapshot without replaying a completed shot', () => {
    const engine = new CarromEngine([{ seat: 0, userId: 'p0' }, { seat: 1, userId: 'p1' }]);
    expect(engine.apply({ type: 'strike', x: 280, angle: 0, power: 0 }, 0).ok).toBe(true);
    actions.state.gameState = engine.state;
    actions.state.lastEvents = [];
    const driver = new Driver(0, []);
    driver.onStateUpdate = () => expect(driver.consumeNewStrike().isNew).toBe(false);
    driver.start();
    expect(driver.lastState?.currentSeat).toBe(1);
    driver.stop();
  });

  it('ignores stale match previews and resets sequence ordering for a new match', () => {
    const driver = new Driver(0, []);
    driver.lastState = { currentSeat: 1, turnNumber: 0 } as any;
    driver.onStrikerPositionUpdate = vi.fn();
    const receive = (data: any) => (driver as any).handleRemoteStrikerPosition({ seat: 1, x: 300, sequence: 1, turnNumber: 0, matchId: 'match', roomId: 'room', ...data });
    receive({ matchId: 'old' }); receive({ roomId: 'other' }); receive({ seat: 0 }); receive({ x: NaN });
    expect(driver.onStrikerPositionUpdate).not.toHaveBeenCalled();
    receive({ sequence: 50 }); receive({ sequence: 49 });
    expect(driver.onStrikerPositionUpdate).toHaveBeenCalledOnce();
    actions.state.matchId = 'rematch'; receive({ matchId: 'rematch' });
    expect(driver.onStrikerPositionUpdate).toHaveBeenCalledTimes(2);
  });
  it.each([0, 1])('maps placement and upward shots for seat %s into valid server actions', async seat => {
    const engine = new CarromEngine([{ seat: 0, userId: 'p0' }, { seat: 1, userId: 'p1' }], () => 0.5);
    engine.state.currentSeat = seat;
    actions.send.mockImplementation(action => engine.apply(action, seat));
    const driver = new Driver(seat, ['Host', 'Guest']);
    expect((await driver.sendPlaceStriker(280)).ok).toBe(true);
    expect(engine.state.striker.x).toBeCloseTo(seat === 0 ? 336 : 264);
    expect(engine.state.striker.y).toBe(seat === 0 ? 507 : 93);
    expect((await driver.sendStrike(-Math.PI / 2, 0.4, 280)).ok).toBe(true);
    expect(actions.send.mock.calls[1][0]).toMatchObject({ type: 'strike', power: 0.4, x: seat === 0 ? 336 : 264 });
    expect(engine.state.lastActionSeat).toBe(seat);
    expect(engine.state.lastTrajectory?.length).toBeGreaterThan(1);
  });
  it('turns a transport failure into a rejected shot so the UI can roll back', async () => {
    actions.send.mockRejectedValue(new Error('Connection lost'));
    await expect(new Driver(0, []).sendStrike(-Math.PI / 2, 0.5, 250)).resolves.toEqual({ ok: false, uncertain: true, error: 'Connection lost' });
  });
  it('does not treat a rejection without a message as success', async () => {
    actions.send.mockResolvedValue({ ok: false });
    const driver = new Driver(0, []);
    expect((await driver.sendPlaceStriker(250)).ok).toBe(false);
    expect((await driver.sendStrike(-Math.PI / 2, 0.5, 250)).ok).toBe(false);
  });
});


describe('Carrom authoritative shot ordering', () => {
  it('does not animate a completed shot from a compact metadata update', () => {
    const engine = new CarromEngine([{ seat: 0, userId: 'p0' }, { seat: 1, userId: 'p1' }]);
    actions.state.gameState = engine.state;
    const driver = new Driver(0, []);
    const animations = vi.fn();
    driver.onStateUpdate = () => { if (driver.consumeNewStrike().isNew) animations(); };
    driver.start();
    engine.apply({ type: 'strike', x: 280, angle: 0, power: 0 }, 0);
    (driver as any)._apply(engine.serializeForSync(false), [], null, 3);
    (driver as any)._apply(engine.serialize(), [], null, 2);
    expect(animations).not.toHaveBeenCalled();
    expect(driver.lastState?.coins).toEqual(engine.state.coins);
    driver.stop();
  });
  it.each([100, 300, 500])('renders delayed and replayed shots once at %sms simulated delivery delay', async delay => {
    vi.useFakeTimers();
    const driver = new Driver(0, []);
    try {
      const engine = new CarromEngine([{ seat: 0, userId: 'p0' }, { seat: 1, userId: 'p1' }]);
      actions.state.gameState = engine.state;
      const shots: number[] = [];
      driver.onStateUpdate = () => { const shot = driver.consumeNewStrike(); if (shot.isNew) shots.push(shot.shotId!); };
      driver.start();
      engine.apply({ type: 'strike', x: 280, angle: 0, power: 0 }, 0);
      const first = structuredClone(engine.state);
      engine.apply({ type: 'strike', x: 280, angle: Math.PI, power: 0 }, 1);
      const second = structuredClone(engine.state);
      setTimeout(() => (driver as any)._apply(first, [], null, 2), delay);
      setTimeout(() => (driver as any)._apply(first, [], null, 2), delay + 20);
      setTimeout(() => (driver as any)._apply(second, [], null, 3), delay + 40);
      setTimeout(() => (driver as any)._apply(first, [], null, 2), delay + 60);
      await vi.advanceTimersByTimeAsync(delay + 80);
      expect(shots).toEqual([first.turnNumber, second.turnNumber]);
      expect(driver.lastState?.coins).toEqual(second.coins);
      expect(driver.lastState?.turnNumber).toBe(second.turnNumber);
    } finally {
      driver.stop();
      vi.useRealTimers();
    }
  });
  it('plays distinct shots with the same timestamp once each and ignores older replay packets', () => {
    const engine = new CarromEngine([{ seat: 0, userId: 'p0' }, { seat: 1, userId: 'p1' }], () => 0.5, { now: () => 1000 });
    actions.state.gameState = engine.state;
    const driver = new Driver(0, []); const shots: number[] = [];
    driver.onStateUpdate = () => { const shot = driver.consumeNewStrike(); if (shot.isNew) shots.push(shot.shotId!); };
    driver.start();
    engine.apply({ type: 'strike', x: 280, angle: 0, power: 0 }, 0);
    const first = structuredClone(engine.state);
    (driver as any)._apply(first, [], null, 2);
    (driver as any)._apply(first, [], null, 2);
    engine.apply({ type: 'strike', x: 280, angle: Math.PI, power: 0 }, 1);
    const second = structuredClone(engine.state);
    expect(second.lastActionAtMs).toBe(first.lastActionAtMs);
    (driver as any)._apply(second, [], null, 3);
    (driver as any)._apply(first, [], null, 2);
    (driver as any)._apply(second, [], null, 3);
    expect(shots).toEqual([first.turnNumber, second.turnNumber]);
    expect(driver.lastState?.turnNumber).toBe(second.turnNumber);
    driver.stop();
  });
  it('requests authoritative state when an accepted shot broadcast has not arrived', async () => {
    actions.state.gameState = new CarromEngine([{ seat: 0, userId: 'p0' }, { seat: 1, userId: 'p1' }]).state;
    actions.state.requestFullStateSync = vi.fn().mockResolvedValue(undefined);
    actions.send.mockResolvedValue({ ok: true });
    const driver = new Driver(0, []); driver.start();
    expect((await driver.sendStrike(0, 0.1, 250)).ok).toBe(true);
    expect(actions.state.requestFullStateSync).toHaveBeenCalledOnce();
    expect(actions.send).toHaveBeenCalledOnce();
    driver.stop();
  });
});


it('does not replay previous shot effects when a full-state sync reuses the event array', () => {
  const engine = new CarromEngine([{ seat: 0, userId: 'p0' }, { seat: 1, userId: 'p1' }]);
  const events = [{ type: 'foul', reason: 'old-shot' }];
  actions.state = { ...actions.state, gameState: engine.state, lastEvents: events, lastStateVersion: 1, renderKey: 1 };
  const driver = new Driver(0, []); driver.onFoul = vi.fn(); driver.start();
  const previous = { ...actions.state };
  actions.state = { ...actions.state, gameState: structuredClone(engine.state), lastStateVersion: 2, renderKey: 2 };
  actions.subscribe.mock.calls[0][0](actions.state, previous);
  expect(driver.onFoul).not.toHaveBeenCalled();
  driver.stop();
});
