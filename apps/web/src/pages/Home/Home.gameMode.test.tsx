import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({
  states: [] as any[], index: 0, effects: [] as Array<() => any>, navigate: vi.fn(),
  config: {} as any, getConfig: vi.fn(),
}));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  const overrides = {
    useState: (initial: any) => {
      const index = hooks.index++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks.states[index], (value: any) => { hooks.states[index] = typeof value === 'function' ? value(hooks.states[index]) : value; }];
    },
    useRef: (value: any) => ({ current: value }),
    useEffect: (effect: () => any) => hooks.effects.push(effect),
  };
  return { ...actual, ...overrides, default: { ...actual, ...overrides } };
});
vi.mock('react-router-dom', () => ({ useNavigate: () => hooks.navigate, useLocation: () => ({ search: '' }) }));
vi.mock('../../store/settingsStore', () => ({ useSettingsStore: (select: any) => select({ settings: {} }) }));
vi.mock('../../store/featureFlagsStore', () => ({ useFeatureEnabled: () => true }));
vi.mock('../../services/api/useMe', () => ({ useMe: () => ({ me: null }) }));
vi.mock('../../services/api/client', () => ({ apiClient: { get: (...args: any[]) => hooks.getConfig(...args) } }));
vi.mock('../../components/ui/Modal', () => ({ Modal: () => null }));
import { Home } from './Home';
import { GameCard } from '../../components/GameCard';
import { MatchSetupModal } from '../../components/MatchSetupModal';
import { Button } from '../../components/ui/Button';

function findAll(root: any, predicate: (node: any) => boolean): any[] {
  if (Array.isArray(root)) return root.flatMap(child => findAll(child, predicate));
  if (!root?.props) return [];
  return [...(predicate(root) ? [root] : []), ...findAll(root.props.children, predicate)];
}
function render(Component: any, props = {}) { hooks.index = 0; return Component(props); }
const find = (root: any, type: any) => findAll(root, node => node.type === type)[0];
beforeEach(() => {
  vi.clearAllMocks(); hooks.states = []; hooks.effects = [];
  hooks.config = { entryFees: [100, 500], defaultEntryFee: 500, onlineEnabled: true };
  hooks.getConfig.mockImplementation(async () => hooks.config);
});
afterEach(() => vi.unstubAllGlobals());

describe('Home game launch selection', () => {
  it.each(['ai', 'multiplayer'] as const)('all popular/grid cards preserve %s selection', mode => {
    const cards = findAll(render(Home), node => node.type === GameCard);
    expect(cards.length).toBeGreaterThan(9); // grid plus popular cards
    for (const card of cards) {
      card.props.onPlay(card.props.game.id, mode);
      const modal = find(render(Home), MatchSetupModal);
      expect(modal.props.game.id).toBe(card.props.game.id);
      expect(modal.props.initialMode).toBe(mode);
      modal.props.onClose();
      expect(find(render(Home), MatchSetupModal)).toBeUndefined();
    }
  });
  it.each(['ai', 'multiplayer'] as const)('%s start follows the right route and stake', mode => {
    const card = find(render(Home), GameCard);
    card.props.onPlay(card.props.game.id, mode);
    find(render(Home), MatchSetupModal).props.onStartGame('chess', mode, 500);
    expect(hooks.navigate).toHaveBeenCalledExactlyOnceWith(mode === 'ai' ? '/games/chess' : '/lobby/chess', {
      state: { mode, stake: mode === 'ai' ? 0 : 500 },
    });
  });
});

describe('setup mode and authoritative game configuration', () => {
  const game = { id: 'chess', title: 'Chess', minEntryFee: 100 } as any;
  it.each(['ai', 'multiplayer'] as const)('initial %s mode is used by Start', mode => {
    const onStartGame = vi.fn();
    const tree = render(MatchSetupModal, { game, initialMode: mode, onClose: vi.fn(), onStartGame });
    find(tree, Button).props.onClick();
    expect(onStartGame).toHaveBeenCalledExactlyOnceWith('chess', mode, mode === 'ai' ? 0 : 100);
    const selected = findAll(tree, node => node.type === 'button' && node.props['aria-pressed'] === true);
    expect(selected).toHaveLength(1);
  });
  it('resets a reused modal to the newly requested mode and current server stake', async () => {
    const onStartGame = vi.fn();
    render(MatchSetupModal, { game, initialMode: 'ai', onClose: vi.fn(), onStartGame });
    render(MatchSetupModal, { game, initialMode: 'multiplayer', onClose: vi.fn(), onStartGame });
    hooks.effects[1](); await Promise.resolve();
    const tree = render(MatchSetupModal, { game, initialMode: 'multiplayer', onClose: vi.fn(), onStartGame });
    find(tree, Button).props.onClick();
    expect(onStartGame).toHaveBeenCalledExactlyOnceWith('chess', 'multiplayer', 500);
  });
  it('disabled online games cannot be started but practice stays available', async () => {
    hooks.config.onlineEnabled = false;
    const props = { game, initialMode: 'multiplayer', onClose: vi.fn(), onStartGame: vi.fn() };
    render(MatchSetupModal, props); hooks.effects[0](); await Promise.resolve();
    let tree = render(MatchSetupModal, props);
    expect(find(tree, Button).props.disabled).toBe(true);
    const practice = findAll(tree, node => node.type === 'button' && node.props['aria-pressed'] === false)[0];
    practice.props.onClick(); tree = render(MatchSetupModal, props);
    expect(find(tree, Button).props.disabled).toBe(false);
    find(tree, Button).props.onClick();
    expect(props.onStartGame).toHaveBeenCalledExactlyOnceWith('chess', 'ai', 0);
  });
});
