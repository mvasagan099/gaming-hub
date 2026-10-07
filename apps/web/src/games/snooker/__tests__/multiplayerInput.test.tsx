import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SnookerEngine } from '../../../../../../packages/game-engine/src/snooker';
const fixture = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as any[], store: {} as any,
  listeners: new Set<any>(), send: vi.fn(), sync: vi.fn(), on: vi.fn(), off: vi.fn(), workerPost: vi.fn(), terminate: vi.fn(), frames: new Map<number, any>(), nextFrame: 0 }));
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
vi.mock('../../../store/multiplayerStore', () => ({ useMultiplayerStore: Object.assign((select: any) => select(fixture.store), {
  getState: () => fixture.store,
  subscribe: (fn: any) => { fixture.listeners.add(fn); return () => fixture.listeners.delete(fn); },
}) }));
vi.mock('../../../components/GameWrapper', () => ({ GameWrapper: () => null }));
vi.mock('../../shared/components/MultiplayerMatchPanel', () => ({ MultiplayerMatchPanel: () => null }));
vi.mock('../rendering/SnookerBallRenderer', () => ({ SnookerBallRenderer: { drawBall: vi.fn() } }));
vi.mock('../rendering/SnookerTableRenderer', () => ({ SnookerTableRenderer: { drawTable: vi.fn() } }));
vi.mock('../rendering/SnookerCueRenderer', () => ({ SnookerCueRenderer: { drawCue: vi.fn(), drawAimGuide: vi.fn() } }));
import Game from '../SnookerGame';
import { ColorPickerModal, SnookerHUD, SnookerMobilePowerMeter } from '../components/SnookerOverlays';
function find(root: any, predicate: (node: any) => boolean): any {
  if (Array.isArray(root)) return root.map(child => find(child, predicate)).find(Boolean);
  if (!root?.props) return undefined;
  return predicate(root) ? root : find(root.props.children, predicate);
}
const canvas = { width: 620, height: 1100, getBoundingClientRect: () => ({ left: 0, top: 0, width: 620, height: 1100 }),
  setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), getContext: () => ({ clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {} }) };
function render() {
  fixture.cursor = 0;
  const tree = Game({ mode: 'multiplayer', onBack: vi.fn() });
  find(tree, n => n.type === 'canvas').props.ref.current = canvas;
  fixture.effects.splice(0).forEach(effect => effect()); return tree;
}
function update(patch: any) {
  const prev = fixture.store; fixture.store = { ...prev, ...patch };
  fixture.listeners.forEach(fn => fn(fixture.store, prev)); return render();
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(100000); vi.clearAllMocks();
  fixture.slots = []; fixture.cursor = 0; fixture.effects = []; fixture.listeners.clear(); fixture.frames.clear(); fixture.nextFrame = 0;
  fixture.send.mockResolvedValue({ ok: true }); fixture.sync.mockResolvedValue(undefined);
  vi.stubGlobal('window', { innerWidth: 500 });
  vi.stubGlobal('requestAnimationFrame', (fn: any) => { const id = ++fixture.nextFrame; fixture.frames.set(id, fn); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => fixture.frames.delete(id));
  vi.stubGlobal('Worker', class { onmessage: any; postMessage = fixture.workerPost; terminate = fixture.terminate; });
  const engine = new SnookerEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]);
  fixture.store = { room: { id: 'room', matchId: 'match', players: [{ seat: 0 }, { seat: 1 }] }, matchId: 'match',
    mySeat: 0, status: 'connected', gameState: engine.serialize(), renderKey: 1, winner: null,
    socket: { on: fixture.on, off: fixture.off, emit: vi.fn() }, sendGameAction: fixture.send, requestFullStateSync: fixture.sync };
});
afterEach(() => { fixture.slots.forEach(slot => slot?.cleanup?.()); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('Snooker multiplayer input lifecycle', () => {
  it('sends a shot immediately during the cue swing and locks repeated gestures', () => {
    render(); const tree = render();
    const meter = find(tree, n => n.type === SnookerMobilePowerMeter);
    meter.props.onShoot(0.6); meter.props.onShoot(0.6);
    expect(fixture.send).toHaveBeenCalledOnce();
    expect(fixture.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'strike', power: 0.6 }));
    expect(fixture.workerPost).toHaveBeenCalledOnce();
  });
  it('keeps one driver when room metadata or the sound setting changes', () => {
    render(); let tree = update({ room: { ...fixture.store.room, code: 'ABCDEF' } });
    find(tree, n => n.type === SnookerHUD).props.setSoundEnabled(false);
    tree = render(); expect(fixture.on).toHaveBeenCalledOnce(); expect(fixture.off).not.toHaveBeenCalled();
    expect(fixture.listeners.size).toBe(1);
  });
  it('keeps cue placement pending until the server accepts it, using the real D coordinates', async () => {
    fixture.store.gameState.cueBallInHand = true; fixture.store.gameState.inBaulkOnly = true;
    let finish!: (value: any) => void; fixture.send.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(); const tree = render(); const node = find(tree, n => n.type === 'canvas');
    // Portrait inverse transform: x=160, y=240 -> screen x=310, y=870.
    node.props.onPointerDown({ preventDefault() {}, pointerId: 1, clientX: 310, clientY: 870 });
    expect(fixture.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'place-cue-ball', x: 160, y: 240 }));
    find(render(), n => n.type === SnookerMobilePowerMeter).props.onShoot(0.6);
    expect(fixture.send).toHaveBeenCalledOnce();
    finish({ ok: false, error: 'Placement rejected' }); await Promise.resolve(); await Promise.resolve();
    expect(find(render(), n => n.type === SnookerMobilePowerMeter).props.disabled).toBe(true);
  });
  it('does not let a spectator shoot', () => {
    fixture.store.mySeat = null; render();
    find(render(), n => n.type === SnookerMobilePowerMeter).props.onShoot(0.6);
    expect(fixture.send).not.toHaveBeenCalled();
  });
  it('restores the server timer on reconnect instead of resetting to twenty seconds', () => {
    render(); update({ status: 'reconnecting' }); update({ status: 'connected' });
    expect(fixture.sync).toHaveBeenCalledOnce();
    const state = { ...fixture.store.gameState, serverTimestamp: 100000, turnDeadlineMs: 105000 };
    update({ gameState: state, renderKey: 2 });
    expect(find(render(), n => n.type === SnookerHUD).props.timeLeft).toBe(5);
    vi.advanceTimersByTime(2000);
    expect(find(render(), n => n.type === SnookerHUD).props.timeLeft).toBe(3);
    expect(fixture.send).not.toHaveBeenCalled();
  });
  it('cancels a mobile power gesture without firing a shot', () => {
    fixture.cursor = 0;
    const onShoot = vi.fn();
    const meter = SnookerMobilePowerMeter({ power: 0.5, setPower: vi.fn(), onShoot }) as { props: any };
    const event = { pointerId: 1, clientY: 50, currentTarget: { setPointerCapture() {}, releasePointerCapture() {} } } as any;
    meter.props.onPointerDown(event); meter.props.onPointerCancel(event); meter.props.onPointerUp(event);
    expect(onShoot).not.toHaveBeenCalled();
  });
  it('does not add animation time back onto the authoritative turn countdown', () => {
    let now = 0;
    vi.stubGlobal('performance', { now: () => now });
    render();
    const state = { ...fixture.store.gameState, stateVersion: 2, serverTimestamp: 100000,
      turnDeadlineMs: 105000, lastProcessedShotId: 'timed-shot',
      keyframes: [0, 120].map(frame => ({ frame, pieces: [] })) };
    update({ gameState: state, renderKey: 2 });
    vi.advanceTimersByTime(2000); now = 2000;
    for (const callback of [...fixture.frames.values()]) callback(now);
    expect(find(render(), n => n.type === SnookerHUD).props.timeLeft).toBe(3);
  });
  it('lets a rejected colour nomination be retried without marking it as accepted', () => {
    const select = vi.fn();
    const draw = () => { fixture.cursor = 0; return ColorPickerModal({ nominatedColor: null, onSelectColor: select }); };
    const button = (tree: any) => find(tree, n => n.type === 'button' && n.key === 'black');
    button(draw()).props.onClick();
    button(draw()).props.onClick();
    expect(select).toHaveBeenCalledTimes(2);
  });
});
