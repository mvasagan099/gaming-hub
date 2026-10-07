import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { SnakeVsWormsEngine } from '@gaming-hub/game-engine';
const fixture = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as any[], store: {} as any,
  listeners: new Set<any>(), send: vi.fn(), sync: vi.fn(), keys: new Map<string, any>(), loop: null as any }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  const same = (a: any[], b: any[]) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useState(initial: any) {
      const i = fixture.cursor++;
      if (!(i in fixture.slots)) fixture.slots[i] = typeof initial === 'function' ? initial() : initial;
      return [fixture.slots[i], (value: any) => { fixture.slots[i] = typeof value === 'function' ? value(fixture.slots[i]) : value; }];
    },
    useRef(initial: any) { const i = fixture.cursor++; return fixture.slots[i] ?? (fixture.slots[i] = { current: initial }); },
    useCallback(fn: any, deps: any[]) {
      const i = fixture.cursor++; const prev = fixture.slots[i];
      if (!prev || !same(prev.deps, deps)) fixture.slots[i] = { deps, fn };
      return fixture.slots[i].fn;
    },
    useEffect(fn: any, deps: any[]) {
      const i = fixture.cursor++; const prev = fixture.slots[i];
      if (!prev || !same(prev.deps, deps)) fixture.effects.push(() => {
        prev?.cleanup?.(); fixture.slots[i] = { deps, cleanup: fn() };
      });
    },
  };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});
vi.mock('../../../store/multiplayerStore', () => ({ useMultiplayerStore: Object.assign((fn: any) => fn(fixture.store), {
  getState: () => fixture.store, subscribe: (fn: any) => { fixture.listeners.add(fn); return () => fixture.listeners.delete(fn); },
}) }));
vi.mock('../../../components/GameWrapper', () => ({ GameWrapper: () => null }));
vi.mock('../../shared/components/MultiplayerMatchPanel', () => ({ MultiplayerMatchPanel: () => null }));
vi.mock('../../shared/hooks/useGameLoop', () => ({ useGameLoop: (fn: any) => { fixture.loop = fn; } }));
vi.mock('../utils/snakeVsWorms3DRenderer', () => ({ SnakeVsWorms3DRenderer: { drawArena: vi.fn(), drawFood: vi.fn(), drawCreature: vi.fn(), drawRadar: vi.fn() } }));
import Game from '../SnakeVsWormsGame';
import { SnakeVsWormsOverlays } from '../components/SnakeVsWormsOverlays';
function find(root: any, test: (node: any) => boolean): any {
  if (Array.isArray(root)) return root.map(child => find(child, test)).find(Boolean);
  if (!root?.props) return undefined;
  return test(root) ? root : find(root.props.children, test);
}
function render() { fixture.cursor = 0; const tree = Game({ mode: 'multiplayer', stake: 100, onBack: vi.fn() }); fixture.effects.splice(0).forEach(fn => fn()); return tree; }
function update(patch: any) { const old = fixture.store; fixture.store = { ...old, ...patch }; fixture.listeners.forEach(fn => fn(fixture.store, old)); return render(); }
const overlay = (tree: any) => find(tree, n => n.type === SnakeVsWormsOverlays).props;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(100000); vi.clearAllMocks();
  fixture.slots = []; fixture.effects = []; fixture.listeners.clear(); fixture.keys.clear(); fixture.cursor = 0;
  fixture.send.mockResolvedValue({ ok: true }); fixture.sync.mockResolvedValue(undefined);
  vi.stubGlobal('window', { addEventListener: (key: string, fn: any) => fixture.keys.set(key, fn), removeEventListener: (key: string) => fixture.keys.delete(key) });
  const engine = new SnakeVsWormsEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]); engine.startMatchClock();
  fixture.store = { room: { id: 'room', gameId: 'snake-vs-worms', players: [{ seat: 0, displayName: 'Alice' }, { seat: 1, displayName: 'Bob' }] },
    matchId: 'match', mySeat: 0, status: 'connected', renderKey: 1, gameState: engine.serialize(),
    sendGameAction: fixture.send, requestFullStateSync: fixture.sync };
});
afterEach(() => { fixture.slots.forEach(slot => slot?.cleanup?.()); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('Snake vs Worms multiplayer UI', () => {
  it('uses authoritative score, length, kills and boost data, without restarting on room metadata', () => {
    render(); const state = structuredClone(fixture.store.gameState);
    Object.assign(state.players[0], { score: 150, kills: 2, boostEnergy: 45 }); state.stateVersion++;
    let tree = update({ gameState: state, renderKey: 2 });
    expect(overlay(tree)).toMatchObject({ score: 150, length: 4, kills: 2 });
    tree = update({ room: { ...fixture.store.room, code: 'ABCDEF' } });
    expect(overlay(tree).score).toBe(150); expect(fixture.listeners.size).toBe(1);
  });
  it('hydrates resignations and draws and resets the finished screen on a new match', () => {
    fixture.store.gameState.finished = true; fixture.store.gameState.winnerSeats = [];
    render(); expect(overlay(render())).toMatchObject({ isGameOver: true, isDraw: true, isWin: false });
    const engine = new SnakeVsWormsEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]);
    update({ matchId: 'rematch', gameState: engine.serialize(), renderKey: 2 });
    expect(overlay(render())).toMatchObject({ isGameOver: false, score: 0, kills: 0 });
  });
  it('releases boost on canceled touch gestures and window blur', () => {
    render(); let tree = render(); const boost = find(tree, n => !!n.props.onPointerCancel);
    const event = { preventDefault() {}, stopPropagation() {} };
    boost.props.onPointerDown(event); boost.props.onPointerCancel();
    expect(fixture.send.mock.calls.map(c => c[0].type)).toEqual(['boost-start', 'boost-stop']);
    boost.props.onPointerDown(event); fixture.keys.get('blur')();
    expect(fixture.send.mock.calls.map(c => c[0].type)).toEqual(['boost-start', 'boost-stop', 'boost-start', 'boost-stop']);
  });
  it('does not steer while typing in chat or let spectators send gameplay', () => {
    render(); fixture.keys.get('keydown')({ key: 'w', code: 'KeyW', target: { tagName: 'INPUT' } });
    expect(fixture.send).not.toHaveBeenCalled();
    update({ mySeat: null }); fixture.keys.get('keydown')({ key: 'w', code: 'KeyW', target: null });
    expect(fixture.send).not.toHaveBeenCalled();
  });
  it('counts down the server clock while freezing it on pause', () => {
    render(); vi.advanceTimersByTime(2000);
    expect(find(render(), n => n.props['aria-label'] === 'Match time remaining').props.children).toEqual([2, ':', '58']);
    update({ renderKey: 2, gameState: { ...fixture.store.gameState, matchRemainingMs: 10000, paused: true, stateVersion: 2 } });
    vi.advanceTimersByTime(5000);
    expect(find(render(), n => n.props['aria-label'] === 'Match time remaining').props.children).toEqual([0, ':', '10']);
  });
  it('steers around a reverse pointer target instead of getting stuck sending forbidden turns', () => {
    render(); const node = find(render(), n => n.type === 'canvas');
    node.props.ref.current = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 600 }),
      getContext: () => ({ fillRect() {}, save() {}, restore() {}, translate() {}, scale() {} }) };
    node.props.onMouseMove({ clientX: 350, clientY: 300 });
    fixture.loop(1 / 60);
    expect(fixture.send).toHaveBeenCalledWith({ type: 'direction', direction: 'down' });
  });
});
