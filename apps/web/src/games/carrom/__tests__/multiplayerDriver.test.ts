import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CarromEngine } from '@gaming-hub/game-engine';
const actions = vi.hoisted(() => ({ send: vi.fn(), state: {} as any }));
vi.mock('../../../store/multiplayerStore', () => ({ useMultiplayerStore: { subscribe: vi.fn(() => vi.fn()), getState: () => ({ ...actions.state, sendGameAction: actions.send }) } }));
vi.mock('../../../store/authStore', () => ({ useAuthStore: { getState: () => ({ user: { id: 'test' } }) } }));
import Driver from '../CarromMultiplayerDriver';
beforeEach(() => { vi.clearAllMocks(); actions.state = { matchId: 'match', room: { id: 'room' } }; });

describe('Carrom multiplayer action delivery', () => {
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
    await expect(new Driver(0, []).sendStrike(-Math.PI / 2, 0.5, 250)).resolves.toEqual({ ok: false, error: 'Connection lost' });
  });
  it('does not treat a rejection without a message as success', async () => {
    actions.send.mockResolvedValue({ ok: false });
    const driver = new Driver(0, []);
    expect((await driver.sendPlaceStriker(250)).ok).toBe(false);
    expect((await driver.sendStrike(-Math.PI / 2, 0.5, 250)).ok).toBe(false);
  });
});
