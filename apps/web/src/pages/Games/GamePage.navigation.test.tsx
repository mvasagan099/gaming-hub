import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_IDS } from '@gaming-hub/shared';

// Exercise the production route's callbacks and effect cleanup without loading
// Phaser/WebGL. Hook state persists across renders, including StrictMode replay.
const context = vi.hoisted(() => ({
  gameId: 'chess', mode: 'multiplayer', search: '', room: null as any,
  navigate: vi.fn(), leaveRoom: vi.fn(),
  blocker: null as any, shouldBlock: null as any, nativeHandler: null as any, unregister: vi.fn(),
  effects: [] as Array<() => void | (() => void)>,
  states: [] as any[], refs: [] as any[], stateIndex: 0, refIndex: 0,
}));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return { ...actual,
    useEffect: (effect: () => void | (() => void)) => context.effects.push(effect),
    useRef: (initial: any) => {
      const index = context.refIndex++;
      return context.refs[index] ??= { current: initial };
    },
    useState: (initial: any) => {
      const index = context.stateIndex++;
      if (!(index in context.states)) context.states[index] = initial;
      return [context.states[index], (value: any) => { context.states[index] = value; }];
    },
  };
});
vi.mock('react-router-dom', () => ({
  useParams: () => ({ slug: context.gameId }),
  useLocation: () => ({ search: context.search, state: { mode: context.mode, stake: 0 } }),
  useNavigate: () => context.navigate, Navigate: () => null,
  useBlocker: (predicate: any) => { context.shouldBlock = predicate; return context.blocker; },
}));
vi.mock('../../services/native/capacitorAppService', () => ({
  registerBackButtonHandler: (handler: any) => { context.nativeHandler = handler; return context.unregister; },
}));
vi.mock('../../store/multiplayerStore', () => ({
  useMultiplayerStore: Object.assign((select: any) => select({ room: context.room, matchId: 'match-1' }), {
    getState: () => ({ room: context.room, leaveRoom: context.leaveRoom }),
  }),
}));
vi.mock('../../components/ui/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
import { GamePage } from './GamePage';

function render() {
  context.stateIndex = context.refIndex = 0;
  return GamePage({}) as React.ReactElement<any>;
}
const dialog = (page: React.ReactElement<any>) => page.props.children[1].props;
const game = (page: React.ReactElement<any>) => page.props.children[0].props.children.props;
const flushCleanup = () => new Promise<void>(resolve => queueMicrotask(resolve));

beforeEach(() => {
  vi.clearAllMocks();
  context.gameId = 'chess'; context.mode = 'multiplayer'; context.search = '';
  context.states = []; context.refs = []; context.effects = [];
  context.blocker = { state: 'unblocked', proceed: vi.fn(), reset: vi.fn(() => { context.blocker.state = 'unblocked'; }) };
  context.shouldBlock = context.nativeHandler = null;
  context.room = { id: 'room-1', gameId: 'chess', status: 'playing' };
  context.leaveRoom.mockImplementation(async () => { context.room = null; });
  vi.stubGlobal('window', {
    history: { state: { idx: 2 }, pushState: vi.fn() },
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('game Exit versus router Back', () => {
  it.each(GAME_IDS)('%s visible Exit confirms; Cancel stays in the game', gameId => {
    context.gameId = gameId; context.room.gameId = gameId;
    game(render()).onBack();
    expect(dialog(render()).isOpen).toBe(true);
    dialog(render()).onClose();
    expect(dialog(render()).isOpen).toBe(false);
    expect(context.leaveRoom).not.toHaveBeenCalled();
    expect(context.navigate).not.toHaveBeenCalled();
  });

  it.each(GAME_IDS)('%s leaves once on confirmed Exit, even when confirmed twice and unmounted', async gameId => {
    context.gameId = gameId; context.room.gameId = gameId;
    const page = render();
    const cleanup = context.effects[0]() as () => void;
    const confirm = dialog(page).onConfirm;
    await Promise.all([confirm(), confirm()]);
    cleanup(); await flushCleanup();
    expect(context.leaveRoom).toHaveBeenCalledOnce();
    expect(context.navigate).toHaveBeenCalledExactlyOnceWith(-1);
  });

  it.each(GAME_IDS)('%s intercepts browser Back in multiplayer playing and shows confirm dialog', async gameId => {
    context.gameId = gameId; context.room.gameId = gameId;
    const page = render();
    for (const effect of context.effects) {
      effect();
    }
    expect(context.shouldBlock).toBe(true);
    expect(context.nativeHandler).toBeDefined();
    expect(window.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    // Browser back button triggers blocker -> confirm exit popup shows
    context.blocker.state = 'blocked';
    expect(dialog(render()).isOpen).toBe(true);

    // Cancel stays in game and resets blocker
    dialog(render()).onClose();
    expect(context.blocker.reset).toHaveBeenCalled();
    expect(context.leaveRoom).not.toHaveBeenCalled();

    // Confirm exit leaves room and proceeds with blocked navigation
    context.blocker.state = 'blocked';
    await dialog(render()).onConfirm();
    expect(context.leaveRoom).toHaveBeenCalledOnce();
    expect(context.blocker.proceed).toHaveBeenCalledOnce();
  });

  it.each(GAME_IDS)('%s StrictMode replay keeps membership; the eventual real unmount leaves', async gameId => {
    context.gameId = gameId; context.room.gameId = gameId;
    render();
    const setup = context.effects[0];
    (setup() as () => void)();
    const cleanup = setup() as () => void;
    await flushCleanup();
    expect(context.leaveRoom).not.toHaveBeenCalled();
    cleanup(); await flushCleanup();
    expect(context.leaveRoom).toHaveBeenCalledOnce();
  });

  it('Back during a pending confirmed leave does not navigate a second time after the ACK', async () => {
    let acknowledge: () => void = () => {};
    context.leaveRoom.mockImplementation(() => {
      context.room = null;
      return new Promise<void>(resolve => { acknowledge = resolve; });
    });
    const page = render();
    const cleanup = context.effects[0]() as () => void;
    const pending = dialog(page).onConfirm();
    cleanup(); await flushCleanup(); // router already navigated away
    acknowledge(); await pending;
    expect(context.leaveRoom).toHaveBeenCalledOnce();
    expect(context.navigate).not.toHaveBeenCalled();
  });

  it('does not leave a different room joined before deferred cleanup', async () => {
    render();
    const cleanup = context.effects[0]() as () => void;
    cleanup();
    context.room = { ...context.room, id: 'room-2' };
    await flushCleanup();
    expect(context.leaveRoom).not.toHaveBeenCalled();
  });

  it('leaves the old room when this route changes from multiplayer to practice', async () => {
    render();
    const cleanup = context.effects[0]() as () => void;
    cleanup(); context.mode = 'ai';
    const nextEffect = context.effects.length; render();
    context.effects[nextEffect](); await flushCleanup();
    expect(context.leaveRoom).toHaveBeenCalledOnce();
  });

  it('practice exit uses the root fallback without leaving multiplayer', async () => {
    context.mode = 'ai';
    (window.history.state as any).idx = 0;
    await dialog(render()).onConfirm();
    expect(context.navigate).toHaveBeenCalledExactlyOnceWith('/');
    expect(context.leaveRoom).not.toHaveBeenCalled();
  });
});

 it('opens a saved replay route without mounting a live game or leaving an unrelated room', async () => {
  context.search = '?replayMatchId=history-match';
  const page = render();
  expect(page.type).toBe(React.Suspense);
  expect(page.props.children.props.matchId).toBe('history-match');
  const cleanup = context.effects[0]() as () => void;
  cleanup();
  await flushCleanup();
  expect(context.leaveRoom).not.toHaveBeenCalled();
 });

it.each(GAME_IDS)('%s legacy tournament links go to the assigned lobby rather than AI practice', gameId => {
  context.gameId = gameId; context.search = '?matchId=assigned-match&tournamentId=tournament';
  const page = render();
  expect(page.props.to).toBe(`/lobby/${gameId}${context.search}`);
  expect(page.props.replace).toBe(true);
});

it.each(['?replayMatchId=saved', '?matchId=tournament'])('does not intercept replay or tournament Back: %s', search => {
  context.search = search;
  render();
  expect(context.shouldBlock).toBe(false);
  expect(context.nativeHandler).toBeNull();
});

it('ai Back does not block navigation before confirmation', () => {
  context.mode = 'ai';
  expect(dialog(render()).isOpen).toBe(false);
  expect(context.shouldBlock).toBe(false);
  expect(context.nativeHandler).toBeNull();
});
