import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  values: [] as unknown[], setters: [] as ReturnType<typeof vi.fn>[],
  effects: [] as Array<() => void>, refs: [] as Array<{ current: unknown }>, refIndex: 0,
  multiplayer: {} as Record<string, any>,
}));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  const overrides = {
    useState: (initial: unknown) => {
      const setter = vi.fn();
      hooks.setters.push(setter);
      return [hooks.values.length ? hooks.values.shift() : initial, setter];
    },
    useRef: (value: unknown) => {
      const index = hooks.refIndex++;
      return hooks.refs[index] ?? (hooks.refs[index] = { current: value });
    },
    useEffect: (effect: () => void) => hooks.effects.push(effect),
  };
  return { ...actual, ...overrides, default: { ...actual, ...overrides } };
});
vi.mock('phaser', () => ({ default: {} }));
vi.mock('./phaser/scenes/FruitNinjaScene', () => ({ FruitNinjaScene: class {} }));
vi.mock('../../store/multiplayerStore', () => ({ useMultiplayerStore: (select: any) => select(hooks.multiplayer) }));

import { FruitNinjaPhaserGame } from './FruitNinjaPhaserGame';
import { FruitNinjaOverlays } from './components/FruitNinjaOverlays';

function find(root: any, predicate: (node: any) => boolean): any {
  if (Array.isArray(root)) return root.map(child => find(child, predicate)).find(Boolean);
  if (!root?.props) return undefined;
  return predicate(root) ? root : find(root.props.children, predicate);
}

beforeEach(() => {
  vi.clearAllMocks(); hooks.values = []; hooks.setters = []; hooks.effects = [];
  hooks.refs = []; hooks.refIndex = 0; hooks.multiplayer = {};
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Fruit Ninja responsive result controls', () => {
  it('preserves the local bomb result through old playing packets and clears it for a new match', () => {
    hooks.multiplayer = { matchId: 'match-1', mySeat: 0, gameState: { finished: false }, winner: null };
    const renderResult = () => {
      hooks.values = [null, 'bomb_elimination', true];
      hooks.setters = []; hooks.effects = []; hooks.refIndex = 0;
      const result = FruitNinjaOverlays({ game: null, isMultiplayer: true, onClose: vi.fn(), onReplay: vi.fn() });
      hooks.effects.forEach(effect => effect());
      return result;
    };
    expect(renderResult()).not.toBeNull();
    expect(hooks.setters.every(setter => setter.mock.calls.length === 0)).toBe(true);
    hooks.multiplayer.gameState = { finished: false, scores: [10, 20] };
    expect(renderResult()).not.toBeNull();
    expect(hooks.setters.every(setter => setter.mock.calls.length === 0)).toBe(true);
    hooks.multiplayer.matchId = 'match-2';
    renderResult();
    expect(hooks.setters[2]).toHaveBeenCalledWith(false);
    expect(hooks.setters[0]).toHaveBeenCalledWith(null);
  });

  it.each([[true, false], [true, true], [false, false], [false, true]])(
    'keeps results outside the arena and delegates exit to the shared HUD (portrait %s, online %s)',
    (portrait, isMultiplayer) => {
      hooks.values = [null, portrait];
      const onBack = vi.fn();
      const onReplay = vi.fn();
      const tree = FruitNinjaPhaserGame({ mode: 'classic', isMultiplayer, onBack, onReplay }) as
        React.ReactElement<{ children: [React.ReactElement<any>, React.ReactElement<any>] }>;
      expect(tree.type).toBe(React.Fragment);
      const [arena, results] = tree.props.children;
      expect(arena.props.style?.transform).toBe(portrait ? 'translate(-50%, -50%) rotate(90deg)' : undefined);
      expect(find(arena, node => node.type === FruitNinjaOverlays)).toBeUndefined();
      expect(results.type).toBe(FruitNinjaOverlays);
      expect(results.props.onClose).toBe(onBack);
      expect(results.props.onReplay).toBe(onReplay);
      expect(find(arena, node => node.type === 'button' && /Exit/.test(node.props.title ?? ''))).toBeUndefined();
      const restart = find(arena, node => node.type === 'button' && node.props.title === 'Restart Match');
      if (portrait && !isMultiplayer) {
        restart.props.onClick();
        expect(onReplay).toHaveBeenCalledOnce();
      } else {
        expect(restart).toBeUndefined();
      }
    },
  );

  function resultScreen() {
    hooks.values = [{ score: 0, combosCount: 0, slicedCount: 0, bombsHit: 0, missedCount: 0 }, null, true];
    const onClose = vi.fn();
    const onReplay = vi.fn();
    const tree = FruitNinjaOverlays({ game: null, onClose, onReplay });
    return { tree, onClose, onReplay };
  }

  it('keeps the result visible while Exit asks for confirmation, so Cancel can return to it', () => {
    const { tree, onClose, onReplay } = resultScreen();
    find(tree, node => node.type === 'button' && node.props.onClick === onClose).props.onClick();
    expect(onClose).toHaveBeenCalledOnce();
    expect(hooks.setters.every(setter => setter.mock.calls.length === 0)).toBe(true);
    expect(onReplay).not.toHaveBeenCalled();
  });

  it('clears the finished presentation and delegates Play Again to the existing replay callback', () => {
    const { tree, onClose, onReplay } = resultScreen();
    find(tree, node => node.type === 'button' && node.props.onClick !== onClose).props.onClick();
    expect(hooks.setters[2]).toHaveBeenCalledWith(false);
    expect(hooks.setters[0]).toHaveBeenCalledWith(null);
    expect(onReplay).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });
});
