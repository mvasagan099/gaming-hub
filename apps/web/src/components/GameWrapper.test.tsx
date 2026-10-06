import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ effects: [] as Array<() => any>, room: null as any }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return { ...actual, useState: (value: any) => [value, vi.fn()],
    useRef: (value: any) => ({ current: value }),
    useEffect: (effect: () => any) => hooks.effects.push(effect) };
});
vi.mock('../store/multiplayerStore', () => ({ useMultiplayerStore: (select: any) => select({ room: hooks.room }) }));
import { GameWrapper } from './GameWrapper';

function buttons(root: any): any[] {
  if (Array.isArray(root)) return root.flatMap(buttons);
  if (!root?.props) return [];
  return [...(root.type === 'button' ? [root.props] : []), ...buttons(root.props.children)];
}
const props = { title: 'Test game', gameId: 'chess' as const, mode: 'multiplayer' as const,
  stake: 100, onBack: vi.fn(), children: 'board', isFullscreen: true };

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); hooks.effects = [];
  hooks.room = { id: 'room-1', code: 'TEST', createdAt: new Date().toISOString(), settings: {}, players: [], spectators: [], maxPlayers: 2 };
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('shared game HUD controls', () => {
  it.each([false, true])('multiplayer has one Exit even when practice owns its exit (%s)', ownPracticeExit => {
    const controls = buttons(GameWrapper({ ...props, hideFloatingExitOnMobile: ownPracticeExit, hideFloatingExitOnDesktop: ownPracticeExit }));
    const exits = controls.filter(button => button['aria-label'] === 'Exit Game');
    expect(exits).toHaveLength(1);
    exits[0].onClick(); expect(props.onBack).toHaveBeenCalledOnce();
    expect(controls.some(button => button.title === 'Quit Game')).toBe(false);
  });
  it.each([true, false])('does not offer a disconnected mute button (fullscreen %s)', isFullscreen => {
    const controls = buttons(GameWrapper({ ...props, isFullscreen }));
    expect(controls.some(button => /mute/i.test(button.title ?? '') || /mute/i.test(button['aria-label'] ?? ''))).toBe(false);
  });
  it('practice games with their own exit do not receive floating exits', () => {
    hooks.room = null;
    const controls = buttons(GameWrapper({ ...props, mode: 'ai', hideFloatingExitOnMobile: true, hideFloatingExitOnDesktop: true }));
    expect(controls.filter(button => button['aria-label'] === 'Exit Game')).toHaveLength(0);
  });
  it('does not block document Back, and clears its HUD timer on unmount', () => {
    GameWrapper(props);
    const cleanups = hooks.effects.map(effect => effect());
    expect(window.addEventListener).not.toHaveBeenCalledWith('beforeunload', expect.anything());
    expect(vi.getTimerCount()).toBe(1);
    cleanups.forEach(cleanup => cleanup?.());
    expect(vi.getTimerCount()).toBe(0);
  });
});
