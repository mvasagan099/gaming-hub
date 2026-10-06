import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { TableTennisEngine } from '../../../../../../packages/game-engine/src/table-tennis/engine';
const fixture = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as any[], store: {} as any,
  listeners: new Set<any>(), send: vi.fn(), sync: vi.fn(), loop: null as any, renderScene: vi.fn() }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  const same = (a: any[], b: any[]) => a?.length === b?.length && a.every((v, i) => Object.is(v, b[i]));
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
vi.mock('../../../store/multiplayerStore', () => ({ useMultiplayerStore: Object.assign((select: any) => select(fixture.store), {
  getState: () => fixture.store,
  subscribe: (listener: any) => { fixture.listeners.add(listener); return () => fixture.listeners.delete(listener); },
}) }));
vi.mock('../../../components/GameWrapper', () => ({ GameWrapper: () => null }));
vi.mock('../../shared/components/MultiplayerMatchPanel', () => ({ MultiplayerMatchPanel: () => null }));
vi.mock('../../shared/hooks/useGameLoop', () => ({ useGameLoop: (fn: any) => { fixture.loop = fn; } }));
vi.mock('../utils/tableTennis3DRenderer', () => ({ TableTennis3DRenderer: {
  project: () => ({ x: 0, y: 0 }), renderScene: fixture.renderScene,
} }));
import Game from '../TableTennisGame';
import { TableTennisOverlays } from '../components/TableTennisOverlays';
function find(root: any, predicate: (node: any) => boolean): any {
  if (Array.isArray(root)) return root.map(child => find(child, predicate)).find(Boolean);
  if (!root?.props) return undefined;
  return predicate(root) ? root : find(root.props.children, predicate);
}
function render() {
  fixture.cursor = 0;
  const tree = Game({ mode: 'multiplayer', stake: 100, onBack: vi.fn() });
  fixture.effects.splice(0).forEach(effect => effect());
  return tree;
}
function update(patch: any) {
  const prev = fixture.store; fixture.store = { ...prev, ...patch };
  fixture.listeners.forEach(listener => listener(fixture.store, prev));
  return render();
}
const readyCalls = () => fixture.send.mock.calls.filter(([action]) => action.type === 'ready');
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); fixture.slots = []; fixture.cursor = 0; fixture.effects = []; fixture.listeners.clear();
  fixture.send.mockResolvedValue({ ok: true }); fixture.sync.mockResolvedValue(undefined);
  vi.stubGlobal('window', { innerWidth: 800, innerHeight: 520, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const engine = new TableTennisEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]);
  fixture.store = { room: { id: 'room', matchId: 'match', players: [{ seat: 0, displayName: 'A' }, { seat: 1, displayName: 'B' }] },
    matchId: 'match', mySeat: 0, status: 'connected', gameState: engine.serialize(), lastEvents: [], winner: null,
    renderKey: 1, sendGameAction: fixture.send, requestFullStateSync: fixture.sync };
});
afterEach(() => { fixture.slots.forEach(slot => slot?.cleanup?.()); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('Table Tennis multiplayer component lifecycle', () => {
  it('keeps one driver across room metadata updates', () => {
    render(); expect(readyCalls()).toHaveLength(1); expect(fixture.listeners.size).toBe(1);
    update({ room: { ...fixture.store.room, code: 'ABCDEF' } });
    expect(readyCalls()).toHaveLength(1); expect(fixture.listeners.size).toBe(1);
  });
  it('shows a draw and clears the previous result when a fresh rematch starts', () => {
    render();
    const finished = { ...fixture.store.gameState, finished: true, phase: 'finished', winnerSeats: [], endReason: 'TIME_EXPIRED' };
    let tree = update({ gameState: finished, renderKey: 2, winner: { winnerSeats: [] } });
    let overlay = find(tree, node => node.type === TableTennisOverlays);
    expect(overlay.props.isGameOver).toBe(true); expect(overlay.props.winner).toBeNull();
    const engine = new TableTennisEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]);
    update({ matchId: 'new-match', room: { ...fixture.store.room, matchId: 'new-match' }, gameState: engine.serialize(), winner: null, renderKey: 3 });
    tree = render(); overlay = find(tree, node => node.type === TableTennisOverlays);
    expect(overlay.props.isGameOver).toBe(false); expect(overlay.props.endReason).toBeNull();
    expect(overlay.props.winner).toBeNull(); expect(readyCalls()).toHaveLength(2); expect(fixture.listeners.size).toBe(1);
  });
  it('restores the server paddle position after reconnect instead of sending the old local target', () => {
    const tree = render();
    find(tree, node => node.type === 'canvas').props.ref.current = { getContext: () => ({}) };
    update({ status: 'reconnecting' });
    update({ status: 'connected' }); expect(fixture.sync).toHaveBeenCalledOnce();
    const state = structuredClone(fixture.store.gameState); state.players[0].paddleY = 240;
    update({ gameState: state, renderKey: 2 });
    fixture.loop(1 / 60);
    expect(fixture.send.mock.calls.filter(([action]) => action.type === 'paddle-move')).toHaveLength(0);
    expect(fixture.renderScene.mock.calls.at(-1)?.[1]).toBe(240);
  });
  it('clears held keyboard controls when focus leaves the game', () => {
    render();
    const handlers = (window.addEventListener as any).mock.calls;
    handlers.find(([name]: any[]) => name === 'keydown')[1]({ key: 'ArrowRight' });
    handlers.find(([name]: any[]) => name === 'blur')[1]();
    const tree = render(); find(tree, node => node.type === 'canvas').props.ref.current = { getContext: () => ({}) };
    fixture.loop(1 / 60);
    expect(fixture.send.mock.calls.filter(([action]) => action.type === 'paddle-move')).toHaveLength(0);
  });
  it('does not offer the serve button to a spectator', () => {
    const tree = render(); const props = find(tree, node => node.type === TableTennisOverlays).props;
    const overlay = TableTennisOverlays({ ...props, mySeat: null, isServing: true, isMultiplayer: true });
    expect(find(overlay, node => node.type === 'button' && node.props.disabled !== undefined).props.disabled).toBe(true);
  });
});
