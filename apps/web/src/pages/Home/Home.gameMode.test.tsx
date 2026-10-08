import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({
  states: [] as any[], index: 0, effects: [] as Array<() => any>, navigate: vi.fn(),
  config: {} as any, getConfig: vi.fn(), joinRoom: vi.fn(), connect: vi.fn(), session: true,
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
vi.mock('../../store/authStore', () => ({ useAuthStore: { getState: () => ({ session: hooks.session }) } }));
vi.mock('../../store/multiplayerStore', () => ({ useMultiplayerStore: { getState: () => ({ connect: hooks.connect, joinRoom: hooks.joinRoom }) } }));
import { Home } from './Home';
import { GameCard } from '../../components/GameCard';
import { MatchSetupModal } from '../../components/MatchSetupModal';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

function findAll(root: any, predicate: (node: any) => boolean): any[] {
  if (Array.isArray(root)) return root.flatMap(child => findAll(child, predicate));
  if (!root?.props) return [];
  return [...(predicate(root) ? [root] : []), ...findAll(root.props.children, predicate)];
}
function render(Component: any, props = {}) { hooks.index = 0; return Component(props); }
const find = (root: any, type: any) => findAll(root, node => node.type === type)[0];
beforeEach(() => {
  vi.clearAllMocks(); hooks.states = []; hooks.effects = []; hooks.session = true;
  hooks.joinRoom.mockResolvedValue({ gameId: "carrom" });
  hooks.config = { entryFees: [100, 500], defaultEntryFee: 500, onlineEnabled: true };
  hooks.getConfig.mockImplementation(async () => hooks.config);
});
afterEach(() => vi.unstubAllGlobals());

describe('Home game launch selection', () => {
  it('private room create shortcut chooses a game without starting a paid match', () => {
    const action = 'create';
    const home = render(Home);
    const shortcut = findAll(home, node => node.type === 'button' && (JSON.stringify(node.props.children) ?? "").includes(action === 'create' ? 'Create Private Room' : 'Join Private Room'))[0];
    shortcut.props.onClick();
    const modal = find(render(Home), Modal);
    expect(modal.props.isOpen).toBe(true);
    const gameButtons = findAll(modal, node => node.type === 'button');
    expect(gameButtons).toHaveLength(9);
    gameButtons[0].props.onClick();
    expect(hooks.navigate).toHaveBeenCalledExactlyOnceWith('/lobby/snake-ladder', { state: { roomAction: action } });
    expect(find(render(Home), Modal).props.isOpen).toBe(false);
    expect(find(render(Home), MatchSetupModal)).toBeUndefined();
  });

  it('joins by code and uses the server room game without asking for game selection', async () => {
    const shortcut = findAll(render(Home), node => node.type === 'button' && (JSON.stringify(node.props.children) ?? '').includes('Join Private Room'))[0];
    shortcut.props.onClick();
    let modal = find(render(Home), Modal);
    expect(findAll(modal, node => node.type === 'img')).toHaveLength(0);
    find(modal, 'input').props.onChange({ target: { value: ' ab12cd ' } });
    modal = find(render(Home), Modal);
    await find(modal, 'form').props.onSubmit({ preventDefault: vi.fn() });
    expect(hooks.connect).toHaveBeenCalledOnce();
    expect(hooks.joinRoom).toHaveBeenCalledExactlyOnceWith({ code: 'AB12CD' });
    expect(hooks.navigate).toHaveBeenCalledExactlyOnceWith('/lobby/carrom');
    expect(find(render(Home), Modal).props.isOpen).toBe(false);
  });
  it.each(['auth', 'invalid-code'])('keeps join errors visible for %s', async reason => {
    hooks.session = reason !== 'auth';
    hooks.joinRoom.mockRejectedValue(new Error('Room not found'));
    const shortcut = findAll(render(Home), node => node.type === 'button' && (JSON.stringify(node.props.children) ?? '').includes('Join Private Room'))[0];
    shortcut.props.onClick();
    find(find(render(Home), Modal), 'input').props.onChange({ target: { value: 'AB12CD' } });
    await find(find(render(Home), Modal), 'form').props.onSubmit({ preventDefault: vi.fn() });
    const modal = find(render(Home), Modal);
    expect(modal.props.isOpen).toBe(true);
    expect(findAll(modal, node => node.props.role === 'alert')[0].props.children).toBe(reason === 'auth' ? 'Sign in to join a private room.' : 'Room not found');
    expect(hooks.navigate).not.toHaveBeenCalled();
    if (reason === 'auth') expect(hooks.joinRoom).not.toHaveBeenCalled();
  });
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
