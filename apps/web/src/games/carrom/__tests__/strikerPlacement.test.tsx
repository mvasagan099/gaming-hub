import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

// Exercise the actual component handlers without mounting the canvas renderer
// or starting timers. Hook slots survive re-renders, just as they do in React.
const hooks = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as Array<() => any>, running: true, doubleUpdaters: false, frame: null as null | ((dt: number) => void) }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const overrides = {
    useState(initial: any) {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks.slots[index], (value: any) => {
        if (hooks.doubleUpdaters && typeof value === 'function') value(hooks.slots[index]);
        hooks.slots[index] = typeof value === 'function' ? value(hooks.slots[index]) : value;
      }];
    },
    useRef(initial: any) {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
      return hooks.slots[index];
    },
    useEffect(effect: any) { hooks.effects.push(effect); },
    useLayoutEffect() {},
    useCallback(callback: any) { return callback; },
  };
  return { ...actual, ...overrides, default: { ...actual, ...overrides } };
});
vi.mock('../../../components/GameWrapper', () => ({ GameWrapper: () => null }));
vi.mock('../../shared/components/MultiplayerMatchPanel', () => ({ MultiplayerMatchPanel: () => null }));
vi.mock('../../shared/hooks/useGameLoop', () => ({ useGameLoop: (frame: (dt: number) => void, running: boolean) => { hooks.frame = frame; hooks.running = running; } }));
vi.mock('../rendering/CarromBoardRenderer', () => ({ CarromBoardRenderer: { drawBoard: vi.fn() } }));
vi.mock('../rendering/CarromPieceRenderer', () => ({ CarromPieceRenderer: { drawCoin: vi.fn() } }));
vi.mock('../rendering/CarromEffectsRenderer', () => ({ CarromEffectsRenderer: {} }));
vi.mock('../../../store/multiplayerStore', () => ({
  useMultiplayerStore: (selector: any) => selector({ mySeat: null, room: null, gameState: null }),
}));
vi.mock('../CarromMultiplayer', () => ({ default: () => null }));
vi.mock('../CarromMultiplayerDriver', () => ({ default: class {} }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { CarromGame } from '../CarromGame';

type Node = ReactElement<any>;
function find(root: any, predicate: (node: Node) => boolean): Node | undefined {
  if (Array.isArray(root)) {
    for (const child of root) {
      const match = find(child, predicate);
      if (match) return match;
    }
  } else if (root && typeof root === 'object' && root.props) {
    if (predicate(root)) return root;
    return find(root.props.children, predicate);
  }
}

function setup() {
  const element = CarromGame({ mode: 'ai', stake: 0, onBack: vi.fn() }) as Node;
  const render = () => {
    hooks.cursor = 0; hooks.effects = [];
    return (element.type as any)(element.props);
  };
  let tree = render();
  find(tree, node => node.type === 'button' && node.props.children === "Let's Play!")!.props.onClick();
  tree = render();
  const canvas = {
    width: 400,
    height: 400,
    getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
    setPointerCapture: vi.fn(),
  };
  hooks.slots[0].current = canvas;
  const coins = hooks.slots.find(slot => Array.isArray(slot?.current) && slot.current[0]?.type === 'striker').current;
  const striker = coins[0];
  const blocker = coins.find((coin: any) => coin.type === 'black');
  blocker.x = 300;
  blocker.y = 338;
  const pointer = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, currentTarget: canvas });
  const board = () => find(render(), node => node.type === 'canvas')!.props;
  const mover = () => find(render(), node => node.type === 'input' && node.props.type === 'range')?.props;
  const tick = () => { render(); hooks.frame!(1 / 60); };
  return { render, board, mover, striker, blocker, coins, pointer, tick };
}

beforeEach(() => { hooks.slots = []; hooks.cursor = 0; hooks.effects = []; hooks.doubleUpdaters = false; vi.clearAllMocks(); });

afterEach(() => vi.useRealTimers());

describe('Carrom striker placement recovery', () => {
  it('keeps the mover available after tapping a coin and allows moving away and shooting', () => {
    const game = setup();
    game.board().onPointerDown(game.pointer(300, 338));
    expect(game.striker.x).toBe(300);
    expect(game.mover()).toBeDefined();
    game.board().onPointerUp();
    expect(game.striker.vx).toBe(0);
    expect(game.striker.vy).toBe(0);
    game.mover()!.onChange({ target: { value: '0' } });
    expect(game.striker.x).toBe(200);
    game.board().onPointerDown(game.pointer(200, 338));
    game.board().onPointerMove(game.pointer(200, 398));
    game.board().onPointerUp();
    expect(game.striker.vy).toBeLessThan(0);
    expect(game.mover()).toBeUndefined(); // hidden only while a shot is moving
  });

  it('allows tapping a clear baseline position after an overlapping placement', () => {
    const game = setup();
    game.board().onPointerDown(game.pointer(300, 338));
    game.board().onPointerDown(game.pointer(200, 338));
    expect(game.striker.x).toBe(200);
    expect(game.mover()).toBeDefined();
  });

  it('keeps repositioning available after entering aiming mode', () => {
    const game = setup();
    game.board().onPointerDown(game.pointer(200, 338));
    game.board().onPointerUp();
    expect(game.mover()).toBeDefined();
    game.mover()!.onChange({ target: { value: '100' } });
    game.board().onPointerDown(game.pointer(300, 338));
    expect(game.mover()).toBeDefined();
    expect(game.striker.vy).toBe(0);
  });

  it('rechecks overlap on release, cancelling a blocked shot without trapping the mover', () => {
    const game = setup();
    game.board().onPointerDown(game.pointer(200, 338));
    game.board().onPointerMove(game.pointer(200, 398));
    game.blocker.x = 200;
    game.board().onPointerUp();
    expect(game.striker.vx).toBe(0);
    expect(game.striker.vy).toBe(0);
    expect(game.mover()).toBeDefined();
  });

  it('moving the slider cancels an old drag rather than firing it', () => {
    const game = setup();
    game.board().onPointerDown(game.pointer(200, 338));
    game.board().onPointerMove(game.pointer(200, 398));
    game.mover()!.onChange({ target: { value: '-50' } });
    game.board().onPointerUp();
    expect(game.striker.x).toBe(150);
    expect(game.striker.vy).toBe(0);
  });

  it('pointer cancellation does not fire an aimed shot', () => {
    const game = setup();
    game.board().onPointerDown(game.pointer(200, 338));
    game.board().onPointerMove(game.pointer(200, 398));
    game.board().onPointerCancel();
    game.board().onPointerUp();
    expect(game.striker.vy).toBe(0);
    expect(game.mover()).toBeDefined();
  });

  it('ignores pocketed coins during placement', () => {
    const game = setup();
    game.blocker.active = false;
    game.board().onPointerDown(game.pointer(300, 338));
    game.board().onPointerMove(game.pointer(300, 398));
    game.board().onPointerUp();
    expect(game.striker.vy).toBeLessThan(0);
  });
});

describe('Carrom pocket capture', () => {
  it.each([{ x: 30, y: 30 }, { x: 370, y: 30 }, { x: 30, y: 370 }, { x: 370, y: 370 }])(
    'captures a stationary coin resting inside the visible pocket at $x,$y exactly once', pocket => {
      const game = setup();
      game.blocker.x = pocket.x + (pocket.x < 200 ? 8 : -8);
      game.blocker.y = pocket.y + (pocket.y < 200 ? 8 : -8);
      game.tick();
      expect(game.blocker.pocketing).toBeDefined();
      for (let frame = 0; frame < 20; frame++) game.tick();
      expect(game.blocker.active).toBe(false);
      const turnScore = hooks.slots.find(slot => slot?.current?.queen === false && 'foul' in slot.current).current;
      expect(turnScore.black).toBe(1);
    },
  );

  it('leaves a coin on the board when it only touches the outside pocket rim', () => {
    const game = setup();
    game.blocker.x = 350;
    game.blocker.y = 50;
    game.tick();
    expect(game.blocker.pocketing).toBeUndefined();
    expect(game.blocker.active).toBe(true);
  });

  it.each([0.3, 18])('captures a coin approaching the pocket at speed %s', speed => {
    const game = setup();
    game.blocker.x = speed < 1 ? 358 : 342;
    game.blocker.y = 43;
    game.blocker.vx = speed;
    for (let frame = 0; frame < 90 && game.blocker.active && !game.blocker.pocketing; frame++) game.tick();
    expect(game.blocker.pocketing).toBeDefined();
    expect(game.blocker.vx).toBe(0);
  });

  it('waits for a pocket drop to finish before settling a shot', () => {
    const game = setup();
    game.board().onPointerDown(game.pointer(200, 338));
    game.board().onPointerMove(game.pointer(200, 398));
    game.board().onPointerUp();
    game.striker.vx = 0;
    game.striker.vy = 0;
    game.blocker.x = 362;
    game.blocker.y = 38;
    game.tick();
    expect(game.blocker.pocketing).toBeDefined();
    expect(game.mover()).toBeUndefined(); // still completing the shot
    for (let frame = 0; frame < 20; frame++) game.tick();
    expect(game.blocker.active).toBe(false);
  });

  it('restores a pocketed striker for the next turn and applies one foul', () => {
    const game = setup();
    game.board().onPointerDown(game.pointer(200, 338));
    game.board().onPointerMove(game.pointer(200, 398));
    game.board().onPointerUp();
    Object.assign(game.striker, { x: 362, y: 38, vx: 0, vy: 0 });
    game.tick();
    expect(game.striker.pocketing).toBeDefined();
    for (let frame = 0; frame < 20; frame++) game.tick();
    expect(game.striker.active).toBe(true);
    expect(game.striker.pocketing).toBeUndefined();
    const rules = hooks.slots.find(slot => slot?.current?.dueOwed).current;
    expect(rules.dueOwed.white).toBe(1);
  });

  it('keeps a pocketed queen off the board while waiting for its cover shot', () => {
    const game = setup();
    game.board().onPointerDown(game.pointer(200, 338));
    game.board().onPointerMove(game.pointer(200, 398));
    game.board().onPointerUp();
    Object.assign(game.striker, { vx: 0, vy: 0 });
    const queen = game.coins.find((coin: any) => coin.type === 'queen');
    Object.assign(queen, { x: 362, y: 38, vx: 0, vy: 0 });
    for (let frame = 0; frame < 20; frame++) game.tick();
    expect(queen.active).toBe(false);
    const rules = hooks.slots.find(slot => slot?.current?.dueOwed).current;
    expect(rules.queenStatus).toBe('pocketed_needs_cover');
    expect(rules.queenPocketedBy).toBe('player');
  });
});

 describe('Carrom restart and cleanup', () => {
  it('clears the second AI shot timer when leaving after it has aimed', () => {
    vi.useFakeTimers();
    const game = setup();
    hooks.slots[hooks.slots.indexOf('player')] = 'ai';
    game.render();
    const cleanups = hooks.effects.map(effect => effect()).filter(value => typeof value === 'function');
    vi.advanceTimersByTime(1500);
    expect(vi.getTimerCount()).toBe(1);
    cleanups.forEach(cleanup => cleanup());
    vi.advanceTimersByTime(2000);
    expect(game.striker.vx).toBe(0);
    expect(game.striker.vy).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops completed rendering and resets coins, queen state and effects for Replay', () => {
    const game = setup();
    hooks.slots[8] = true; // completed game
    const rules = hooks.slots.find(slot => slot?.current?.dueOwed).current;
    rules.queenStatus = 'covered';
    game.coins[1].active = false;
    const oldCoins = game.coins;
    const tree = game.render();
    expect(hooks.running).toBe(false);
    find(tree, node => node.type === 'button' && node.props.children === 'Replay')!.props.onClick();
    game.render();
    expect(hooks.running).toBe(true);
    const coins = hooks.slots.find(slot => Array.isArray(slot?.current) && slot.current[0]?.type === 'striker').current;
    expect(coins).not.toBe(oldCoins);
    expect(coins.every((coin: any) => coin.active && coin.vx === 0 && coin.vy === 0)).toBe(true);
    expect(hooks.slots.find(slot => slot?.current?.dueOwed).current.queenStatus).toBe('unpocketed');
    expect(game.mover()).toBeDefined();
  });
 });

 describe('Carrom completed-shot rules', () => {
  function settledShot(game: ReturnType<typeof setup>) {
    game.board().onPointerDown(game.pointer(200, 338));
    game.board().onPointerMove(game.pointer(200, 398));
    game.board().onPointerUp();
    game.striker.vx = 0; game.striker.vy = 0;
    return hooks.slots.find(slot => slot?.current?.queen === false && 'foul' in slot.current).current;
  }
  it('returns one foul coin and keeps the score consistent when React rechecks updaters', () => {
    const game = setup(); const stats = settledShot(game);
    stats.foul = true;
    game.coins.find((coin: any) => coin.type === 'white').active = false;
    hooks.slots[1] = { white: 1, black: 0 };
    hooks.doubleUpdaters = true;
    game.tick();
    expect(hooks.slots[1].white).toBe(0);
    expect(game.coins.filter((coin: any) => coin.type === 'white' && !coin.active)).toHaveLength(0);
    expect(hooks.slots.find(slot => slot?.current?.dueOwed).current.dueOwed.white).toBe(0);
  });
  it('covers queen and own coin in one shot and ends only once all drops are settled', () => {
    vi.useFakeTimers();
    const game = setup(); const stats = settledShot(game);
    for (const coin of game.coins) if (coin.type === 'white' || coin.type === 'queen') coin.active = false;
    stats.queen = true; stats.white = 1;
    game.tick(); game.render();
    expect(hooks.slots.find(slot => slot?.current?.dueOwed).current.queenStatus).toBe('covered');
    expect(hooks.running).toBe(false);
    expect(vi.getTimerCount()).toBe(0); // no delayed game-over callback can enter a replay
  });
  it('returns the queen after a striker foul instead of covering it', () => {
    const game = setup(); const stats = settledShot(game);
    const queen = game.coins.find((coin: any) => coin.type === 'queen');
    queen.active = false; stats.queen = true; stats.white = 1; stats.foul = true;
    game.tick();
    expect(queen.active).toBe(true);
    expect(hooks.slots.find(slot => slot?.current?.dueOwed).current.queenStatus).toBe('unpocketed');
    expect(hooks.slots[8]).toBe(false);
  });
  it('does not declare a win while the queen still needs a cover shot', () => {
    const game = setup(); const stats = settledShot(game);
    for (const coin of game.coins) if (coin.type === 'white' || coin.type === 'queen') coin.active = false;
    stats.queen = true; stats.white = 0;
    game.tick(); game.render();
    expect(hooks.slots.find(slot => slot?.current?.dueOwed).current.queenStatus).toBe('pocketed_needs_cover');
    expect(hooks.running).toBe(true);
  });
  it('passes an AI turn without eligible pieces instead of getting stuck thinking forever', () => {
    vi.useFakeTimers();
    const game = setup();
    for (const coin of game.coins) if (coin.type === 'black' || coin.type === 'queen') coin.active = false;
    const playerIndex = hooks.slots.indexOf('player');
    hooks.slots[playerIndex] = 'ai'; game.render();
    const cleanups = hooks.effects.map(effect => effect()).filter(value => typeof value === 'function');
    vi.advanceTimersByTime(1500);
    expect(hooks.slots[playerIndex]).toBe('player');
    cleanups.forEach(cleanup => cleanup());
    expect(vi.getTimerCount()).toBe(0);
  });

 });
