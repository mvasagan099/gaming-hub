import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_IDS } from '@gaming-hub/shared';

const context = vi.hoisted(() => ({ gameId: 'chess', mode: 'multiplayer', state: {} as any, rematch: vi.fn() }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  const overrides = {
    useState: (value: any) => [typeof value === 'function' ? value() : value, vi.fn()],
    useRef: (value: any) => ({ current: value }),
    useEffect: vi.fn(), useLayoutEffect: vi.fn(),
    useCallback: (callback: any) => callback,
    useMemo: (factory: any) => factory(),
  };
  return { ...actual, ...overrides, default: { ...actual, ...overrides } };
});
vi.mock('react-router-dom', () => ({
  useParams: () => ({ slug: context.gameId }),
  useLocation: () => ({ state: { mode: context.mode, stake: 100 } }),
  useNavigate: () => vi.fn(), Navigate: () => null,
}));
vi.mock('../../store/multiplayerStore', () => ({
  useMultiplayerStore: Object.assign((selector: any) => selector(context.state), {
    getState: () => ({ ...context.state, rematch: context.rematch }),
  }),
}));
vi.mock('../../components/ui/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
vi.mock('../../components/GameWrapper', () => ({ GameWrapper: () => null }));
vi.mock('../../games/shared/components/MultiplayerMatchPanel', () => ({ MultiplayerMatchPanel: () => null }));
vi.mock('../../games/shared/hooks/useGameLoop', () => ({ useGameLoop: vi.fn() }));
vi.mock('../../games/table-tennis/utils/tableTennis3DRenderer', () => ({ TableTennis3DRenderer: {} }));
vi.mock('../../games/snake-vs-worms/utils/snakeVsWorms3DRenderer', () => ({ SnakeVsWorms3DRenderer: {} }));
vi.mock('../../games/fruit-ninja/FruitNinjaPhaserGame', () => ({ FruitNinjaPhaserGame: () => null }));

import { GamePage } from './GamePage';
import { TableTennisGame } from '../../games/table-tennis/TableTennisGame';
import { TableTennisOverlays } from '../../games/table-tennis/components/TableTennisOverlays';
import { SnakeVsWormsGame } from '../../games/snake-vs-worms/SnakeVsWormsGame';
import { SnakeVsWormsOverlays } from '../../games/snake-vs-worms/components/SnakeVsWormsOverlays';
import { FruitNinjaGame } from '../../games/fruit-ninja/FruitNinjaGame';
import { FruitNinjaPhaserGame } from '../../games/fruit-ninja/FruitNinjaPhaserGame';

function find(root: any, type: any): any {
  if (Array.isArray(root)) return root.map(child => find(child, type)).find(Boolean);
  if (root?.props) return root.type === type ? root : find(root.props.children, type);
}

beforeEach(() => {
  vi.clearAllMocks();
  context.mode = 'multiplayer';
  context.state = { room: { id: 'room-1', gameId: context.gameId, status: 'ended', players: [], matchId: 'match-1' }, matchId: 'match-1', mySeat: 0 };
  vi.stubGlobal('window', { innerWidth: 390, innerHeight: 844 });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('rematch game presentation', () => {
  it.each(GAME_IDS)('creates a fresh %s view only when the authoritative match changes', gameId => {
    context.gameId = gameId;
    context.state.room.gameId = gameId;
    const initial = find(GamePage({}), React.Suspense);
    expect(initial.key).toBe('match-1');
    context.state.rematchState = { active: true, requestedBy: ['p1'] };
    expect(find(GamePage({}), React.Suspense).key).toBe(initial.key);
    context.state.matchId = 'match-2';
    context.state.room.status = 'playing';
    expect(find(GamePage({}), React.Suspense).key).toBe('match-2');
    expect(context.rematch).not.toHaveBeenCalled();
  });

  it.each([
    ['table-tennis', TableTennisGame, TableTennisOverlays],
    ['snake-vs-worms', SnakeVsWormsGame, SnakeVsWormsOverlays],
    ['fruit-ninja', FruitNinjaGame, FruitNinjaPhaserGame],
  ] as const)('%s replay requests an online rematch instead of restarting locally', (_id, Game, overlay) => {
    const props = find(Game({ mode: 'multiplayer', stake: 100, onBack: vi.fn() }), overlay).props;
    props.onReplay();
    expect(context.rematch).toHaveBeenCalledOnce();
  });
});
