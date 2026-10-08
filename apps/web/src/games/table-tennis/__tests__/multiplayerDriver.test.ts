import { TableTennisEngine } from '../../../../../../packages/game-engine/src/table-tennis/engine';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const actions = vi.hoisted(() => ({ send: vi.fn(), state: {} as any, listener: null as any }));
vi.mock('../../../store/multiplayerStore', () => ({
  useMultiplayerStore: { subscribe: (listener: any) => { actions.listener = listener; return () => { actions.listener = null; }; }, getState: () => ({ ...actions.state, sendGameAction: actions.send }) },
}));
import Driver from '../TableTennisMultiplayerDriver';
let driver: Driver;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1000); vi.clearAllMocks();
  actions.state = {}; actions.listener = null;
  actions.send.mockResolvedValue({ ok: true });
  driver = new Driver(0, []); driver.start();
});
afterEach(() => { driver.stop(); vi.useRealTimers(); });
describe('Table Tennis paddle delivery', () => {
  it('bounds outstanding movement requests and retains only the latest unsent input', async () => {
    const acknowledgements: ((result: { ok: boolean }) => void)[] = [];
    actions.send.mockImplementation(() => new Promise(done => acknowledgements.push(done)));
    for (let y = 160; y <= 250; y += 10) { driver.sendPaddleMove(y, 1); await vi.advanceTimersByTimeAsync(50); }
    expect(actions.send).toHaveBeenCalledTimes(8);
    acknowledgements[0]({ ok: true }); await vi.advanceTimersByTimeAsync(20);
    expect(actions.send).toHaveBeenCalledTimes(9);
    expect(actions.send).toHaveBeenLastCalledWith({ type: 'paddle-move', y: 250, velocity: 1 });
  });
  it('maintains paced 25 Hz movement with 200 ms acknowledgements and flushes the final position', async () => {
    actions.send.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ ok: true }), 200)));
    for (let i = 0; i < 60; i++) { driver.sendPaddleMove(100 + i, 1); await vi.advanceTimersByTimeAsync(1000 / 60); }
    expect(actions.send).toHaveBeenCalledTimes(25);
    await vi.advanceTimersByTimeAsync(240);
    expect(actions.send).toHaveBeenLastCalledWith({ type: 'paddle-move', y: 159, velocity: 1 });
  });
  it('releases timed-out movement slots and sends the latest queued position', async () => {
    actions.send.mockImplementation(() => new Promise((_, reject) => setTimeout(() => reject(new Error('ACK timeout')), 8000)));
    for (let y = 160; y <= 250; y += 10) { driver.sendPaddleMove(y, 1); await vi.advanceTimersByTimeAsync(50); }
    expect(actions.send).toHaveBeenCalledTimes(8);
    await vi.advanceTimersByTimeAsync(8000);
    expect(actions.send).toHaveBeenCalledTimes(9);
    expect(actions.send).toHaveBeenLastCalledWith({ type: 'paddle-move', y: 250, velocity: 1 });
  });
  it('sends first movement immediately and coalesces following input at a safe rate', async () => {
    driver.sendPaddleMove(160, 0);
    expect(actions.send).toHaveBeenCalledOnce();
    driver.sendPaddleMove(170, 1);
    vi.advanceTimersByTime(15);
    driver.sendPaddleMove(180, 1);
    expect(actions.send).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(25);
    expect(actions.send).toHaveBeenLastCalledWith({ type: 'paddle-move', y: 180, velocity: 1 });
    expect(actions.send).toHaveBeenCalledTimes(2);
  });
  it('cancels obsolete queued movement when the paddle returns to its previous position', () => {
    driver.sendPaddleMove(160, 0); driver.sendPaddleMove(180, 1); driver.sendPaddleMove(160, 0);
    vi.advanceTimersByTime(100);
    expect(actions.send).toHaveBeenCalledOnce();
  });
  it('does not send queued or new movement after shutdown', () => {
    driver.sendPaddleMove(160, 0); driver.sendPaddleMove(180, 1); driver.stop();
    vi.advanceTimersByTime(100); driver.sendPaddleMove(200, 1);
    expect(actions.send).toHaveBeenCalledOnce();
  });
});
function readyState() {
  const engine = new TableTennisEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }], () => 0);
  engine.apply({ type: 'ready' }, 0); engine.apply({ type: 'ready' }, 1);
  return engine;
}
describe('Table Tennis multiplayer action and result guards', () => {
  it('does not serve before readiness, during pause, or after shutdown', () => {
    const engine = new TableTennisEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }], () => 0);
    driver.applyState(engine.state); driver.sendServe(); expect(actions.send).not.toHaveBeenCalled();
    driver.applyState({ ...readyState().state, paused: true });
    driver.sendServe(); driver.sendPaddleMove(180, 0); expect(actions.send).not.toHaveBeenCalled();
    driver.applyState(readyState().state); driver.stop(); driver.sendServe(); driver.sendReady();
    expect(actions.send).not.toHaveBeenCalled();
  });
  it('coalesces duplicate serve gestures and permits retry after a rejection', async () => {
    driver.applyState(readyState().state);
    actions.send.mockResolvedValueOnce({ ok: false, error: 'Too frequent' });
    driver.sendServe(); driver.sendServe(); expect(actions.send).toHaveBeenCalledOnce();
    await Promise.resolve(); driver.sendServe(); expect(actions.send).toHaveBeenCalledTimes(2);
    driver.sendServe(); expect(actions.send).toHaveBeenCalledTimes(2);
  });
  it('retries an unchanged paddle position after transport rejection', async () => {
    driver.applyState(readyState().state);
    actions.send.mockRejectedValueOnce(new Error('Network gap'));
    driver.sendPaddleMove(180, 1); await Promise.resolve(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(40); driver.sendPaddleMove(180, 0);
    expect(actions.send).toHaveBeenCalledTimes(2);
  });
  it('emits point effects and a drawn result only once for repeated snapshots', () => {
    const point = vi.fn(), finished = vi.fn(); driver.setOnPointScored(point); driver.setOnMatchComplete(finished);
    const state = { ...readyState().state, totalPointsPlayed: 1 };
    driver.applyState(state, [{ type: 'point-scored', winnerSeat: 0 } as any]);
    driver.applyState(state, [{ type: 'point-scored', winnerSeat: 0 } as any]);
    expect(point).toHaveBeenCalledOnce();
    driver.applyState({ ...state, finished: true, winnerSeats: [] });
    driver.applyState({ ...state, finished: true, winnerSeats: [] }, [], { winnerSeats: [], winnerIds: [] });
    expect(finished).toHaveBeenCalledOnce(); expect(finished).toHaveBeenCalledWith(null);
  });
  it('ignores updates belonging to an old match or another room', () => {
    const scoped = new Driver(0, [], 'match', 'room'); const receive = vi.fn(); scoped.setOnStateUpdate(receive); scoped.start();
    actions.listener({ matchId: 'old', room: { id: 'room' }, gameState: readyState().state, renderKey: 2 }, { renderKey: 1 });
    actions.listener({ matchId: 'match', room: { id: 'other' }, gameState: readyState().state, renderKey: 2 }, { renderKey: 1 });
    expect(receive).not.toHaveBeenCalled(); scoped.stop();
  });
});


describe('Table Tennis reconnect delivery', () => {
  it('old connection ACKs cannot release a new connection movement slot', async () => {
    const acknowledgements: ((result: { ok: boolean }) => void)[] = [];
    actions.send.mockImplementation(() => new Promise(done => acknowledgements.push(done)));
    driver.sendPaddleMove(170, 1);
    actions.listener({ status: 'disconnected' }, { status: 'connected' });
    const sync = vi.fn().mockResolvedValue(undefined);
    actions.listener({ status: 'connected', requestFullStateSync: sync }, { status: 'disconnected' });
    expect(sync).toHaveBeenCalledOnce();
    driver.applyState(readyState().state);
    for (let y = 180; y <= 260; y += 10) { driver.sendPaddleMove(y, 1); await vi.advanceTimersByTimeAsync(50); }
    expect(actions.send).toHaveBeenCalledTimes(9);
    acknowledgements[0]({ ok: true }); await vi.advanceTimersByTimeAsync(50);
    expect(actions.send).toHaveBeenCalledTimes(9);
    acknowledgements[1]({ ok: true }); await vi.advanceTimersByTimeAsync(20);
    expect(actions.send).toHaveBeenCalledTimes(10);
    expect(actions.send).toHaveBeenLastCalledWith({ type: 'paddle-move', y: 260, velocity: 1 });
  });
});
