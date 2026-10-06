import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomFull } from '@gaming-hub/shared';

const fixture = vi.hoisted(() => ({
  slug: 'chess', effects: [] as Array<() => void | (() => void)>, navigate: vi.fn(),
  multiplayer: {} as Record<string, any>,
}));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  const overrides = {
    useState: (initial: unknown) => [initial, vi.fn()],
    useEffect: (effect: () => void) => fixture.effects.push(effect),
  };
  return { ...actual, ...overrides, default: { ...actual, ...overrides } };
});
vi.mock('react-router-dom', () => ({
  Link: () => null, useParams: () => ({ slug: fixture.slug }),
  useLocation: () => ({ state: null }), useNavigate: () => fixture.navigate,
}));
vi.mock('../../store/authStore', () => ({ useAuthStore: (select: any) => select({ session: {}, user: { id: 'guest' } }) }));
vi.mock('../../store/multiplayerStore', () => ({
  useMultiplayerStore: Object.assign((select: any) => select(fixture.multiplayer), { setState: vi.fn() }),
}));
vi.mock('../../store/settingsStore', () => ({ useSettingsStore: (select: any) => select({ settings: {} }) }));
vi.mock('../../store/walletStore', () => ({ useWalletStore: (select: any) => select({ balance: 1000, isStale: false }) }));
vi.mock('../../services/api/useMe', () => ({ useMe: () => ({ me: null }) }));
vi.mock('../../services/api/usePublicProfile', () => ({ usePublicProfile: () => ({ profile: null }) }));
vi.mock('./RoomChat', () => ({ RoomChat: () => null }));
vi.mock('../../components/ui/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
import { LobbyPage } from './LobbyPage';

beforeEach(() => {
  vi.clearAllMocks(); fixture.effects = []; fixture.slug = 'chess';
  fixture.multiplayer = {
    room: null, status: 'connected', matchmaking: { queued: false }, messages: [], emojis: [],
    connect: vi.fn(), disconnect: vi.fn(), clearError: vi.fn(),
  };
});
function renderRoom(gameId: string, status = 'waiting', matchId: string | null = null) {
  fixture.multiplayer.room = {
    id: 'room', code: 'ABC234', gameId, status, matchId, stake: 100, players: [], spectators: [], settings: {},
  } as unknown as RoomFull;
  LobbyPage({});
  fixture.effects.forEach(effect => effect());
}

describe('private room lobby navigation', () => {
  it('joins the authoritative game lobby when a code belongs to another game', () => {
    renderRoom('carrom');
    expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/lobby/carrom', { replace: true });
  });
  it('restores the correct lobby before opening an already-started room', () => {
    renderRoom('carrom', 'playing', 'match');
    expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/lobby/carrom', { replace: true });
  });
  it('stays in the current lobby while waiting for readiness', () => {
    renderRoom('chess');
    expect(fixture.navigate).not.toHaveBeenCalled();
  });
  it('opens the matching game with the server room stake after start', () => {
    renderRoom('chess', 'playing', 'match');
    expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/games/chess', { state: { mode: 'multiplayer', stake: 100 } });
  });
  it('does not navigate before joining a room', () => {
    LobbyPage({}); fixture.effects.forEach(effect => effect());
    expect(fixture.navigate).not.toHaveBeenCalled();
  });
});
