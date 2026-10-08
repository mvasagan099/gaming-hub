import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ slug: 'chess', stake: 200, cells: [] as any[], cursor: 0,
  effects: [] as any[], pending: [] as Array<() => void>, get: vi.fn(), create: vi.fn(), search: vi.fn() }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  const hooks = {
    useState: (initial: any) => {
      const i = fixture.cursor++;
      if (!fixture.cells[i]) fixture.cells[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [fixture.cells[i].value, (next: any) => { fixture.cells[i].value = typeof next === 'function' ? next(fixture.cells[i].value) : next; }];
    },
    useRef: (initial: any) => { const i = fixture.cursor++; return fixture.cells[i] ??= { current: initial }; },
    useEffect: (effect: any, deps: any[]) => {
      const i = fixture.cursor++, old = fixture.effects[i];
      if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) {
        fixture.pending.push(() => { old?.cleanup?.(); fixture.effects[i] = { deps, cleanup: effect() }; });
      }
    },
  };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});
vi.mock('react-router-dom', () => ({ Link: () => null, useParams: () => ({ slug: fixture.slug }),
  useLocation: () => ({ search: '', state: { stake: fixture.stake } }), useNavigate: () => vi.fn() }));
vi.mock('../../services/api/client', () => ({ apiClient: { get: fixture.get } }));
vi.mock('../../store/authStore', () => ({ useAuthStore: (s: any) => s({ session: {}, user: { id: 'user' } }) }));
vi.mock('../../store/multiplayerStore', () => ({ useMultiplayerStore: (s: any) => s({ room: null,
  status: 'connected', matchmaking: { queued: false }, messages: [], emojis: [], connect: vi.fn(),
  clearError: vi.fn(), createRoom: fixture.create, joinMatchmaking: fixture.search }) }));
vi.mock('../../store/settingsStore', () => ({ useSettingsStore: (s: any) => s({ settings: {} }) }));
vi.mock('../../store/walletStore', () => ({ useWalletStore: (s: any) => s({ balance: 5000, isStale: false }) }));
vi.mock('../../services/api/useMe', () => ({ useMe: () => ({ me: null }) }));
vi.mock('../../services/api/usePublicProfile', () => ({ usePublicProfile: () => ({ profile: null }) }));
vi.mock('../../hooks/useRoomCountdown', () => ({ useRoomCountdown: () => null }));
vi.mock('./RoomChat', () => ({ RoomChat: () => null }));
import { LobbyPage } from './LobbyPage';
function render() { fixture.cursor = 0; const tree = LobbyPage({}); fixture.pending.splice(0).forEach(run => run()); return tree; }
function text(node: any): string { if (Array.isArray(node)) return node.map(text).join(''); return node?.props ? text(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : ''; }
function buttons(node: any): any[] { if (Array.isArray(node)) return node.flatMap(buttons); if (!node?.props) return []; return [...(node.type === 'button' ? [node] : []), ...buttons(node.props.children)]; }
function button(tree: any, label: string) { return buttons(tree).find(b => text(b).includes(label)); }
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => { vi.clearAllMocks(); fixture.slug = 'chess'; fixture.stake = 200; fixture.cells = []; fixture.effects = []; fixture.pending = []; });
afterEach(() => { fixture.effects.forEach(effect => effect?.cleanup?.()); });
describe('lobby authoritative entry stakes', () => {
  it('waits for configuration, replaces invalid navigation stake, and submits the server default', async () => {
    let resolve!: (config: any) => void;
    fixture.get.mockReturnValue(new Promise(r => { resolve = r; }));
    let tree = render();
    expect(button(tree, 'Quick Match').props.disabled).toBe(true);
    expect(button(tree, 'Private Room').props.disabled).toBe(true);
    resolve({ entryFees: [75, 150], defaultEntryFee: 150, onlineEnabled: true }); await flush(); tree = render();
    expect(buttons(tree).filter(b => /^\d+$/.test(text(b))).map(text)).toEqual(['75', '150']);
    button(tree, 'Quick Match').props.onClick(); await flush();
    expect(fixture.search).toHaveBeenCalledWith('chess', 150, expect.any(Object));
    button(tree, 'Private Room').props.onClick(); await flush();
    expect(fixture.create).toHaveBeenCalledWith('chess', true, 150, expect.any(Number), expect.any(Object));
  });
  it('preserves a valid requested stake instead of resetting to the default', async () => {
    fixture.get.mockResolvedValue({ entryFees: [100, 200], defaultEntryFee: 100 }); render(); await flush();
    button(render(), 'Quick Match').props.onClick(); await flush();
    expect(fixture.search).toHaveBeenCalledWith('chess', 200, expect.any(Object));
  });
  it('does not fabricate stake options or permit new rooms after configuration failure', async () => {
    fixture.get.mockRejectedValue(new Error('offline')); render(); await flush(); const tree = render();
    expect(text(tree)).toContain('Unable to load entry stakes');
    expect(button(tree, 'Quick Match').props.disabled).toBe(true);
    button(tree, 'Private Room').props.onClick(); await flush(); expect(fixture.create).not.toHaveBeenCalled();
  });
  it('honors the server online-disable flag', async () => {
    fixture.get.mockResolvedValue({ entryFees: [100], defaultEntryFee: 100, onlineEnabled: false }); render(); await flush(); const tree = render();
    expect(button(tree, 'Quick Match').props.disabled).toBe(true);
    expect(button(tree, 'Private Room').props.disabled).toBe(true);
  });
  it('ignores a late previous-game response after the lobby route changes', async () => {
    let old!: (config: any) => void;
    fixture.get.mockReturnValueOnce(new Promise(r => { old = r; })).mockResolvedValueOnce({ entryFees: [50], defaultEntryFee: 50 });
    render(); fixture.slug = 'carrom'; render(); await flush();
    old({ entryFees: [999], defaultEntryFee: 999 }); await flush(); const tree = render();
    expect(buttons(tree).filter(b => /^\d+$/.test(text(b))).map(text)).toEqual(['50']);
    button(tree, 'Quick Match').props.onClick(); await flush();
    expect(fixture.search).toHaveBeenCalledWith('carrom', 50, expect.any(Object));
  });
});
