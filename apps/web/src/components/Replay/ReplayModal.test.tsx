import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as any[], get: vi.fn() }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return { ...actual,
    useState(initial: any) {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = initial;
      return [hooks.slots[index], (value: any) => { hooks.slots[index] = typeof value === 'function' ? value(hooks.slots[index]) : value; }];
    },
    useRef(initial: any) { const index = hooks.cursor++; return hooks.slots[index] ??= { current: initial }; },
    useMemo(factory: any) { return factory(); },
    useEffect(effect: any) { hooks.effects.push(effect); },
  };
});
vi.mock('../../services/api/client', () => ({ apiClient: { get: hooks.get } }));
vi.mock('./CarromReplayBoard', () => ({ CarromReplayBoard: () => null }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
import { ReplayModal } from './ReplayModal';
function render(matchId = 'match-1') {
  hooks.cursor = 0; hooks.effects = [];
  return ReplayModal({ matchId, onClose: vi.fn() });
}
function find(node: any, title: string): any {
  if (Array.isArray(node)) return node.map(n => find(n, title)).find(Boolean);
  if (node?.props) return node.props.title === title ? node : find(node.props.children, title);
}
const pkg = { gameId: 'carrom', events: [{ resultData: {}, actionData: {} }], initialState: {}, finalState: {},
  metadata: { durationMs: 1000, resultReason: 'NORMAL' } };
beforeEach(() => { hooks.slots = []; hooks.get.mockReset(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());
describe('saved replay lifecycle', () => {
  it('aborts a closed replay request and ignores its late response', async () => {
    let resolve!: (value: any) => void;
    hooks.get.mockReturnValue(new Promise(r => { resolve = r; }));
    render();
    const cleanup = hooks.effects[0]();
    const signal = hooks.get.mock.calls[0][1].signal;
    cleanup();
    expect(signal.aborted).toBe(true);
    resolve(pkg); await Promise.resolve(); await Promise.resolve();
    expect(hooks.slots[1]).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resets playback and old data while switching matches', async () => {
    hooks.get.mockResolvedValueOnce(pkg).mockReturnValue(new Promise(() => {}));
    render(); const cleanup = hooks.effects[0]();
    await Promise.resolve();
    hooks.slots[2] = 7; hooks.slots[3] = true;
    cleanup(); render('match-2'); hooks.effects[0]();
    expect(hooks.slots.slice(0, 4)).toEqual([true, null, 0, false]);
    expect(hooks.get.mock.calls[1][0]).toBe('/matches/match-2/replay');
  });

  it('restarts from the first action when Play is pressed at the end', async () => {
    hooks.get.mockResolvedValue(pkg);
    render(); hooks.effects[0](); await Promise.resolve();
    find(render(), 'Play').props.onClick();
    expect(hooks.slots[2]).toBe(0); expect(hooks.slots[3]).toBe(true);
    render(); hooks.effects[1]();
    vi.advanceTimersByTime(1000);
    expect(hooks.slots[3]).toBe(false);
  });
});
