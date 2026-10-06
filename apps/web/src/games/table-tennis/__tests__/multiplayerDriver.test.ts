import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const actions = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../../../store/multiplayerStore', () => ({
  useMultiplayerStore: { subscribe: vi.fn(() => vi.fn()), getState: () => ({ sendGameAction: actions.send }) },
}));
import Driver from '../TableTennisMultiplayerDriver';
let driver: Driver;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1000); vi.clearAllMocks();
  actions.send.mockResolvedValue({ ok: true });
  driver = new Driver(0, []); driver.start();
});
afterEach(() => { driver.stop(); vi.useRealTimers(); });
describe('Table Tennis paddle delivery', () => {
  it('sends first movement immediately and coalesces following input at a safe rate', () => {
    driver.sendPaddleMove(160, 0);
    expect(actions.send).toHaveBeenCalledOnce();
    driver.sendPaddleMove(170, 1);
    vi.advanceTimersByTime(15);
    driver.sendPaddleMove(180, 1);
    expect(actions.send).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(25);
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
