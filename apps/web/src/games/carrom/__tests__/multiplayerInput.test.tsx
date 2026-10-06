import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CarromEngine } from '@gaming-hub/game-engine';
import { predictCarromShot } from '../shotPreview';

const fixture = vi.hoisted(() => ({
  slots: [] as any[], cursor: 0, effects: [] as Array<() => any>, driver: null as any,
  worker: null as any, message: null as any, state: null as any, seat: 0, animate: null as any, consume: vi.fn(), place: vi.fn(), strike: vi.fn(), live: vi.fn(),
}));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  const overrides = {
    useState(initial: any) {
      const index = fixture.cursor++;
      if (!(index in fixture.slots)) fixture.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [fixture.slots[index], (value: any) => {
        fixture.slots[index] = typeof value === 'function' ? value(fixture.slots[index]) : value;
      }];
    },
    useRef(initial: any) {
      const index = fixture.cursor++;
      return fixture.slots[index] ?? (fixture.slots[index] = { current: initial });
    },
    useEffect(effect: any) { fixture.effects.push(effect); },
    useLayoutEffect() {}, useCallback(callback: any) { if (callback.length === 0) fixture.animate = callback; return callback; },
  };
  return { ...actual, ...overrides, default: { ...actual, ...overrides } };
});
vi.mock('../CarromMultiplayerDriver', async original => {
  const actual = await original<typeof import('../CarromMultiplayerDriver')>();
  return { ...actual, default: class {
    lastState = fixture.state;
    onStateUpdate: any;
    constructor() { fixture.driver = this; }
    start() { this.onStateUpdate(this.lastState, 1); }
    stop() {}
    consumeNewStrike() { return fixture.consume(); }
    canStrike() { return this.lastState.currentSeat === fixture.seat; }
    canPlaceStriker() { return this.canStrike(); }
    sendStrike = fixture.strike;
    sendPlaceStriker = fixture.place;
    sendLiveStrikerPosition = fixture.live;
    getPlayerName() { return 'Player'; }
  } };
});
vi.mock('../../../store/multiplayerStore', () => ({
  useMultiplayerStore: Object.assign((select: any) => select({ room: { id: 'room' } }), { getState: () => ({ matchId: 'match' }) }),
}));
vi.mock('../../../components/GameWrapper', () => ({ GameWrapper: () => null }));
vi.mock('../../shared/components/MultiplayerMatchPanel', () => ({ MultiplayerMatchPanel: () => null }));
vi.mock('../../../store/authStore', () => ({ useAuthStore: { getState: () => ({ user: null }) } }));
vi.mock('../rendering/CarromBoardRenderer', () => ({ CarromBoardRenderer: { drawBoard: vi.fn() } }));
vi.mock('../rendering/CarromPieceRenderer', () => ({ CarromPieceRenderer: { drawCoin: vi.fn() } }));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { error: vi.fn() }) }));
import CarromMultiplayer from '../CarromMultiplayer';

function find(root: any, predicate: (node: any) => boolean): any {
  if (Array.isArray(root)) return root.map(child => find(child, predicate)).find(Boolean);
  if (!root?.props) return undefined;
  return predicate(root) ? root : find(root.props.children, predicate);
}
function setup(seat = 0) {
  fixture.seat = seat;
  fixture.state = new CarromEngine([{ seat: 0, userId: 'p0' }, { seat: 1, userId: 'p1' }], () => 0.5).state;
  fixture.state.currentSeat = seat;
  fixture.state.striker.y = seat === 0 ? 507 : 93;
  const render = () => {
    fixture.cursor = 0; fixture.effects = [];
    return CarromMultiplayer({ mySeat: seat, playerNames: ['Host', 'Guest'], stake: 0, onBack: vi.fn() });
  };
  render(); fixture.effects[0]();
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }), setPointerCapture: vi.fn() };
  fixture.slots[0].current = canvas;
  const board = () => find(render(), node => node.type === 'canvas').props;
  const mover = () => find(render(), node => node.type === 'input' && node.props.type === 'range')?.props;
  const pointer = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, currentTarget: canvas });
  return { board, mover, pointer, render };
}
function frames() {
  let time = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const canvas = fixture.slots[0].current;
  canvas.getContext = () => new Proxy({}, { get: () => vi.fn(() => ({ addColorStop: vi.fn() })) });
  canvas.width = 500; canvas.height = 500;
  return (at: number) => { time = at; fixture.animate(); };
}
function striker() {
  return fixture.slots.find(slot => Array.isArray(slot?.current) && slot.current.some((coin: any) => coin.type === 'striker'))
    .current.find((coin: any) => coin.type === 'striker');
}
function receiveShot(finished = false, trajectory?: any[], seat = 0) {
  const state = { ...fixture.state, turnNumber: 1, currentSeat: 1, finished, winnerSeats: finished ? [0] : [] };
  fixture.consume.mockReturnValueOnce({ isNew: true, shotId: 123, bySeat: seat, angle: 0, power: 0.5,
    pocketedCoinIds: [], pocketEvents: [], keyframes: trajectory ?? [
      { frame: 0, pieces: [{ id: 'striker', x: 300, y: 507 }] },
      { frame: 20, pieces: [{ id: 'striker', x: 300, y: 300 }] },
    ] });
  fixture.driver.lastState = state; fixture.driver.onStateUpdate(state, 2);
  return state;
}
beforeEach(() => {
  fixture.slots = []; fixture.cursor = 0; fixture.effects = []; vi.clearAllMocks(); vi.useFakeTimers();
  fixture.worker = null; fixture.message = null;
  vi.stubGlobal('Worker', class {
    onmessage: any;
    constructor() { fixture.worker = this; }
    postMessage(message: any) { fixture.message = message; }
    terminate() {}
  });
  fixture.consume.mockReturnValue({ isNew: false });
  fixture.place.mockResolvedValue({ ok: true }); fixture.strike.mockResolvedValue({ ok: true });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Carrom multiplayer striker controls', () => {
  it.each([0, 1])('starts seat %s immediately and confirms without rewinding', seat => {
    const game = setup(seat); const tick = frames();
    const board = game.board();
    board.onPointerDown(game.pointer(250, 422.5)); board.onPointerMove(game.pointer(250, 485)); board.onPointerUp();
    const start = striker().y;
    tick(16); expect(striker().y).toBeLessThan(start);
    const trajectory = predictCarromShot(fixture.message.state, fixture.message.seat, fixture.message.action);
    fixture.worker.onmessage({ data: { requestId: fixture.message.requestId, keyframes: trajectory } });
    tick(200); const previewY = striker().y;
    expect(game.mover()).toBeUndefined();
    const state = receiveShot(false, trajectory, seat);
    tick(200); expect(striker().y).toBeCloseTo(previewY, 4);
    fixture.driver.onStateUpdate(state, 2); tick(216);
    expect(fixture.strike).toHaveBeenCalledOnce();
  });
  it('starts immediately even when the browser cannot create a worker', () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('Workers unavailable'); } });
    const game = setup(); const tick = frames(); const board = game.board();
    board.onPointerDown(game.pointer(250, 422.5)); board.onPointerMove(game.pointer(250, 485)); board.onPointerUp();
    const start = striker().y; tick(16); expect(striker().y).toBeLessThan(start);
    receiveShot(true); fixture.driver.onWin(0); tick(500);
    expect(find(game.render(), node => node.type === 'h2' && node.props.children === 'YOU WIN!')).toBeDefined();
  });

  it('ignores a worker result after server confirmation', () => {
    const game = setup(); const tick = frames(); const board = game.board();
    board.onPointerDown(game.pointer(250, 422.5)); board.onPointerMove(game.pointer(250, 485)); board.onPointerUp();
    receiveShot(true); fixture.driver.onWin(0);
    fixture.worker.onmessage({ data: { requestId: fixture.message.requestId, keyframes: [{ frame: 0, pieces: [] }, { frame: 600, pieces: [] }] } });
    tick(500);
    expect(find(game.render(), node => node.type === 'h2' && node.props.children === 'YOU WIN!')).toBeDefined();
  });

  it('holds the settled preview until a late confirmation without replaying it', () => {
    const game = setup(); const tick = frames(); const board = game.board();
    board.onPointerDown(game.pointer(250, 422.5)); board.onPointerMove(game.pointer(250, 485)); board.onPointerUp();
    const trajectory = predictCarromShot(fixture.message.state, fixture.message.seat, fixture.message.action);
    fixture.worker.onmessage({ data: { requestId: fixture.message.requestId, keyframes: trajectory } });
    tick(3500); expect(game.mover()).toBeUndefined();
    const state = receiveShot(true); fixture.driver.onWin(0); tick(3500);
    expect(find(game.render(), node => node.type === 'h2' && node.props.children === 'YOU WIN!')).toBeDefined();
    expect(fixture.driver.lastState).toBe(state);
  });
  it('ignores a delayed rejection from an earlier shot after the player retries', async () => {
    let first!: (result: any) => void, second!: (result: any) => void;
    fixture.strike.mockReturnValueOnce(new Promise(resolve => { first = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { second = resolve; }));
    const game = setup();
    const shoot = () => {
      const board = game.board();
      board.onPointerDown(game.pointer(250, 422.5)); board.onPointerMove(game.pointer(250, 485)); board.onPointerUp();
    };
    shoot(); await vi.advanceTimersByTimeAsync(4001); shoot();
    first({ ok: false, error: 'Old request failed' }); await Promise.resolve(); await Promise.resolve();
    expect(game.mover()).toBeUndefined();
    second({ ok: false, error: 'Current request failed' }); await Promise.resolve(); await Promise.resolve();
    expect(game.mover()).toBeDefined();
  });

  it('keeps a confirmed final shot playing when its acknowledgement fails late', async () => {
    let reply!: (result: any) => void;
    fixture.strike.mockReturnValue(new Promise(resolve => { reply = resolve; }));
    const game = setup(); const tick = frames(); const board = game.board();
    board.onPointerDown(game.pointer(250, 422.5)); board.onPointerMove(game.pointer(250, 485)); board.onPointerUp();
    receiveShot(true); fixture.driver.onWin(0); tick(100);
    reply({ ok: false, error: 'Acknowledgement connection lost' });
    await Promise.resolve(); await Promise.resolve();
    const result = () => find(game.render(), node => node.type === 'h2' && node.props.children === 'YOU WIN!');
    expect(result()).toBeUndefined();
    tick(500); expect(result()).toBeDefined();
  });

  it('waits for the final shot animation before displaying the match result', () => {
    const game = setup(); const tick = frames();
    receiveShot(true); fixture.driver.onWin(0);
    const result = () => find(game.render(), node => node.type === 'h2' && node.props.children === 'YOU WIN!');
    expect(result()).toBeUndefined();
    tick(500); expect(result()).toBeDefined();
  });
  it('applies the latest buffered board when shot animation completes', () => {
    const game = setup();
    let time = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => time);
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    const ctx = new Proxy({}, { get: () => vi.fn(() => ({ addColorStop: vi.fn() })) });
    fixture.slots[0].current.getContext = () => ctx;
    fixture.slots[0].current.width = 500; fixture.slots[0].current.height = 500;
    const shot = { ...fixture.state, turnNumber: 1, currentSeat: 1 };
    fixture.consume.mockReturnValueOnce({ isNew: true, shotId: 123, bySeat: 0, angle: 0, power: 0,
      pocketedCoinIds: [], pocketEvents: [], keyframes: [{ frame: 0, pieces: [] }, { frame: 1, pieces: [] }] });
    fixture.driver.lastState = shot; fixture.driver.onStateUpdate(shot, 2);
    const latest = { ...shot, turnNumber: 2, currentSeat: 0, striker: { ...shot.striker, x: 360 } };
    fixture.driver.lastState = latest; fixture.driver.onStateUpdate(latest, 3);
    time = 500; fixture.animate();
    expect(game.mover()).toBeDefined();
    expect(game.mover().value).toBe(50);
  });

  it('shows the server coin count without subtracting a queen bonus', () => {
    const game = setup();
    const next = { ...fixture.state, queenState: 'COVERED', queenCoveredBySeat: 0,
      players: fixture.state.players.map((player: any) => ({ ...player, score: player.seat === 0 ? 4 : 0 })) };
    fixture.driver.lastState = next;
    fixture.driver.onStateUpdate(next, 2);
    const score = find(game.render(), node => Array.isArray(node.props.children) && node.props.children[0] === 4 && node.props.children[1] === '/9');
    expect(score).toBeDefined();
  });
  it('repositions on a baseline tap without firing an accidental shot', () => {
    const game = setup(); const board = game.board();
    board.onPointerDown(game.pointer(490, 435));
    board.onPointerUp();
    expect(fixture.strike).not.toHaveBeenCalled();
  });

  it.each([0, 1])('allows seat %s to tap its baseline and shoot from the new position', seat => {
    const game = setup(seat); const board = game.board();
    board.onPointerDown(game.pointer(310, 422.5));
    board.onPointerMove(game.pointer(310, 485));
    board.onPointerUp();
    expect(fixture.strike).toHaveBeenCalledOnce();
    expect(fixture.strike.mock.calls[0][2]).toBe(310);
  });

  it.each([0, 1])('fires a rapid gesture from seat %s even before React rerenders', seat => {
    const game = setup(seat);
    const board = game.board();
    board.onPointerDown(game.pointer(250, 422.5));
    board.onPointerMove(game.pointer(250, 485));
    board.onPointerUp();
    expect(fixture.strike).toHaveBeenCalledOnce();
    expect(fixture.strike.mock.calls[0][1]).toBeGreaterThan(0);
  });
  it('cancels a gesture without firing a shot', () => {
    const game = setup(); const board = game.board();
    board.onPointerDown(game.pointer(250, 422.5));
    board.onPointerMove(game.pointer(250, 485));
    board.onPointerCancel(); board.onPointerUp();
    expect(fixture.strike).not.toHaveBeenCalled();
  });
  it('cancels an aim when the server moves the turn to the opponent', () => {
    const game = setup(); const board = game.board();
    board.onPointerDown(game.pointer(250, 422.5));
    board.onPointerMove(game.pointer(250, 485));
    const next = { ...fixture.state, currentSeat: 1, turnNumber: 2 };
    fixture.driver.lastState = next;
    fixture.driver.onStateUpdate(next, 2);
    board.onPointerUp();
    expect(fixture.strike).not.toHaveBeenCalled();
  });
  it('restores controls after a rejected shot so the player can try again', async () => {
    fixture.strike.mockResolvedValueOnce({ ok: false, error: 'Connection lost' });
    const game = setup();
    const shoot = () => {
      const board = game.board();
      board.onPointerDown(game.pointer(250, 422.5));
      board.onPointerMove(game.pointer(250, 485));
      board.onPointerUp();
    };
    shoot(); await Promise.resolve(); await Promise.resolve();
    expect(game.mover()).toBeDefined();
    shoot();
    expect(fixture.strike).toHaveBeenCalledTimes(2);
  });
  it('does not duplicate placement on release and blur', async () => {
    const game = setup(); const mover = game.mover();
    mover.onChange({ target: { value: '30' } });
    const pending = mover.onPointerUp(); mover.onBlur();
    await pending; await mover.onBlur();
    expect(fixture.place).toHaveBeenCalledExactlyOnceWith(280);
  });
  it('keeps a newer striker position when an old placement reply is rejected', async () => {
    let complete!: (value: any) => void;
    fixture.place.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const game = setup(); const mover = game.mover();
    mover.onChange({ target: { value: '30' } });
    const pending = mover.onPointerUp();
    mover.onChange({ target: { value: '60' } });
    complete({ ok: false, error: 'old placement rejected' }); await pending;
    const striker = fixture.slots.find(slot => Array.isArray(slot?.current) && slot.current.some((coin: any) => coin.type === 'striker')).current.find((coin: any) => coin.type === 'striker');
    expect(striker.x).toBe(310);
  });
});
