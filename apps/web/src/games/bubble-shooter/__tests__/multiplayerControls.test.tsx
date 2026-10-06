import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BubbleShooterEngine } from '@gaming-hub/game-engine';

// Exercise the real component's inputs, synchronization effects and frame loop.
const hooks = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as (() => void)[], frame: null as null | ((dt: number) => void) }));
const store = vi.hoisted(() => ({ state: {} as any, send: vi.fn(), sync: vi.fn() }));
const renderer = vi.hoisted(() => ({ drawBubble: vi.fn(), drawShooter: vi.fn(), drawAimGuide: vi.fn() }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  const same = (a: unknown[], b?: unknown[]) => !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const overrides = {
    useRef(initial: any) {
      const i = hooks.cursor++;
      if (!(i in hooks.slots)) hooks.slots[i] = { current: initial };
      return hooks.slots[i];
    },
    useState(initial: any) {
      const i = hooks.cursor++;
      if (!(i in hooks.slots)) hooks.slots[i] = typeof initial === 'function' ? initial() : initial;
      return [hooks.slots[i], (value: any) => { hooks.slots[i] = typeof value === 'function' ? value(hooks.slots[i]) : value; }];
    },
    useCallback(callback: any, deps: unknown[]) {
      const i = hooks.cursor++;
      if (!same(deps, hooks.slots[i]?.deps)) hooks.slots[i] = { deps, callback };
      return hooks.slots[i].callback;
    },
    useEffect(effect: () => any, deps: unknown[]) {
      const i = hooks.cursor++;
      if (!same(deps, hooks.slots[i]?.deps)) {
        const cleanup = hooks.slots[i]?.cleanup;
        hooks.slots[i] = { deps };
        hooks.effects.push(() => { cleanup?.(); hooks.slots[i].cleanup = effect(); });
      }
    },
  };
  return { ...actual, ...overrides, default: { ...actual, ...overrides } };
});
vi.mock('../../../components/GameWrapper', () => ({ GameWrapper: () => null }));
vi.mock('../../shared/components/MultiplayerMatchPanel', () => ({ MultiplayerMatchPanel: () => null }));
vi.mock('../../shared/hooks/useGameLoop', () => ({ useGameLoop: (frame: (dt: number) => void) => { hooks.frame = frame; } }));
vi.mock('../utils/bubble3DRenderer', () => ({ Bubble3DRenderer: renderer }));
vi.mock('../../../store/multiplayerStore', () => ({
  useMultiplayerStore: Object.assign((selector: any) => selector(store.state), { getState: () => ({ ...store.state, sendGameAction: store.send, syncGameState: store.sync }) }),
}));

import { BubbleShooterGame } from '../BubbleShooterGame';

function find(root: any, predicate: (node: any) => boolean): any {
  if (Array.isArray(root)) return root.map(child => find(child, predicate)).find(Boolean);
  if (root?.props) return predicate(root) ? root : find(root.props.children, predicate);
}

function setup(mode: 'ai' | 'multiplayer' = 'multiplayer', seat = 0) {
  const engine = new BubbleShooterEngine([{ userId: 'p1', seat: 0 }, { userId: 'p2', seat: 1 }]);
  engine.state.players[seat].nextBubble = { color: '#34d399', type: 'normal' };
  engine.state.players[seat].queuedBubble = { color: '#c084fc', type: 'normal' };
  store.state = { gameState: structuredClone(engine.state), mySeat: seat, isSpectator: false, room: { players: [] }, matchId: 'match-1' };
  store.send.mockResolvedValue({ ok: true });
  store.sync.mockResolvedValue(undefined);
  const render = () => {
    hooks.cursor = 0;
    hooks.effects = [];
    const tree = BubbleShooterGame({ mode, stake: 0, onBack: vi.fn() });
    hooks.effects.forEach(effect => effect());
    return tree;
  };
  render();
  hooks.slots[0].current = {
    width: 384, height: 580,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 384, height: 580 }),
    getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) }),
  };
  const board = () => find(render(), node => node.type === 'canvas').props;
  const tick = () => { render(); hooks.frame!(1 / 60); };
  const receive = () => { store.state.gameState = structuredClone(engine.state); render(); };
  return { engine, render, board, tick, receive };
}

beforeEach(() => { hooks.slots = []; hooks.cursor = 0; hooks.effects = []; vi.clearAllMocks(); });
afterEach(() => {
  hooks.slots.forEach(slot => slot?.cleanup?.());
  vi.useRealTimers();
});

describe('Bubble Shooter component multiplayer controls', () => {
  it.each([0, 1])('shows the correct cannon/preview and submits one shot from seat %s', seat => {
    const game = setup('multiplayer', seat);
    game.tick();
    expect(renderer.drawShooter.mock.lastCall?.slice(4, 8)).toEqual(['#34d399', 'normal', '#c084fc', 'normal']);
    game.board().onClick({ clientX: 250, clientY: 160 });
    game.board().onClick({ clientX: 250, clientY: 160 });
    expect(store.send).toHaveBeenCalledOnce();
    expect(store.send.mock.lastCall![0]).toEqual({ type: 'shoot', angle: Math.atan2(160 - 544, 250 - 192) });
    game.tick();
    expect(renderer.drawShooter.mock.lastCall![8]).toBe(true);
  });

  it('preserves the flight on opponent updates and applies the server board only after landing', () => {
    const game = setup();
    game.board().onClick({ clientX: 192, clientY: 0 });
    game.engine.apply({ type: 'shoot', angle: -Math.PI / 2 }, 1);
    game.receive();
    game.tick();
    expect(renderer.drawShooter.mock.lastCall![8]).toBe(true);
    game.engine.apply(store.send.mock.lastCall![0], 0);
    game.receive();
    game.tick();
    expect(renderer.drawShooter.mock.lastCall![8]).toBe(true);
    for (let frame = 0; frame < 90; frame++) game.tick();
    expect(renderer.drawShooter.mock.lastCall![8]).toBe(false);
    expect(renderer.drawShooter.mock.lastCall![4]).toBe(game.engine.state.players[0].nextBubble.color);
    game.board().onClick({ clientX: 192, clientY: 0 });
    expect(store.send).toHaveBeenCalledTimes(2);
  });

  it('aims a mobile tap at its release location and blocks its duplicate click', () => {
    const game = setup();
    game.board().onTouchEnd({ changedTouches: [{ clientX: 320, clientY: 220 }] });
    game.board().onClick({ clientX: 320, clientY: 220 });
    expect(store.send).toHaveBeenCalledExactlyOnceWith({ type: 'shoot', angle: Math.atan2(220 - 544, 320 - 192) });
  });

  it.each(['rejection', 'network error'])('recovers the controls after a %s', async failure => {
    const game = setup();
    if (failure === 'rejection') store.send.mockResolvedValue({ ok: false, error: 'Shot rejected' });
    else store.send.mockRejectedValue(new Error('connection lost'));
    game.board().onClick({ clientX: 192, clientY: 0 });
    await Promise.resolve(); await Promise.resolve();
    expect(find(game.render(), node => node.props.role === 'status')).toBeDefined();
    game.board().onClick({ clientX: 192, clientY: 0 });
    expect(store.send).toHaveBeenCalledTimes(2);
  });

  it('does not submit a synthetic mobile click after an immediate shot rejection', async () => {
    const game = setup();
    store.send.mockResolvedValue({ ok: false, error: 'Shot rejected' });
    game.board().onTouchEnd({ changedTouches: [{ clientX: 192, clientY: 0 }] });
    await Promise.resolve(); await Promise.resolve();
    game.board().onClick({ clientX: 192, clientY: 0 });
    expect(store.send).toHaveBeenCalledOnce();
  });

  it('resyncs rather than leaving the cannon permanently locked after a missing broadcast', () => {
    vi.useFakeTimers();
    const game = setup();
    game.board().onClick({ clientX: 192, clientY: 0 });
    vi.advanceTimersByTime(8000);
    expect(store.sync).toHaveBeenCalledOnce();
    game.board().onClick({ clientX: 192, clientY: 0 });
    expect(store.send).toHaveBeenCalledTimes(2);
  });

  it('keeps solo play local and never submits a multiplayer action', () => {
    const game = setup('ai');
    game.board().onClick({ clientX: 192, clientY: 0 });
    game.tick();
    expect(store.send).not.toHaveBeenCalled();
    expect(renderer.drawShooter.mock.lastCall![8]).toBe(true);
  });
});
