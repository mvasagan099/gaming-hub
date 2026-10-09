import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, pending: [] as any[], games: [] as any[] }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  const hooks = {
    useRef(initial: any) { const i = fixture.cursor++; return fixture.slots[i] ??= { current: initial }; },
    useState(initial: any) { const i = fixture.cursor++; if (!(i in fixture.slots)) fixture.slots[i] = typeof initial === 'function' ? initial() : initial; return [fixture.slots[i], (value: any) => { fixture.slots[i] = value; }]; },
    useEffect(fn: any, deps: any[]) {
      const i = fixture.cursor++, old = fixture.slots[i];
      if (!old || deps.some((dep, j) => !Object.is(dep, old.deps[j]))) fixture.pending.push(() => {
        old?.cleanup?.(); fixture.slots[i] = { deps, cleanup: fn() };
      });
    },
  };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});
vi.mock('phaser', () => ({ default: { AUTO: 0, Scale: { FIT: 0, CENTER_BOTH: 0 }, Game: class {
  registry = { set: vi.fn() }; scale = { refresh: vi.fn() }; destroy = vi.fn();
  constructor() { fixture.games.push(this); }
} } }));
vi.mock('../../chess/phaser/scenes/ChessScene', () => ({ ChessScene: class {} }));
vi.mock('../../ludo/phaser/scenes/LudoScene', () => ({ LudoScene: class {} }));
vi.mock('../../chess/components/ChessOverlays', () => ({ ChessOverlays: () => null }));
vi.mock('../../chess/components/ChessMatchPanel', () => ({ ChessDesktopSidebar: () => null, ChessMobileTop: () => null, ChessMobileBottom: () => null }));
import { ChessPhaserGame } from '../../chess/ChessPhaserGame';
import { LudoPhaserGame } from '../../ludo/LudoPhaserGame';
const props = { mode: 'pvp' as const, level: 2, theme: 'classic' as const, online: true, players: 2, seat: 0, names: ['Host', 'Guest'], onBack: vi.fn(), onReplay: vi.fn() };
function render(component: any, data: any) {
  fixture.cursor = 0; fixture.pending = [];
  const attach = (node: any): void => {
    if (Array.isArray(node)) { node.forEach(attach); return; }
    if (!node?.props) return;
    if (node.props.ref) node.props.ref.current = {};
    attach(node.props.children);
  };
  attach(component(data)); fixture.pending.forEach(run => run());
}
beforeEach(() => {
  fixture.slots = []; fixture.games = []; fixture.cursor = 0;
  vi.stubGlobal('window', { innerHeight: 800, innerWidth: 1280, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
describe.each([['Chess', ChessPhaserGame], ['Ludo', LudoPhaserGame]])('%s board lifecycle', (_name, component) => {
  it('preserves the board and its state on repeated equal-name updates', () => {
    render(component, props);
    const game = fixture.games[0]; game.authoritativeState = { turn: 8 };
    for (let i = 0; i < 20; i++) render(component, { ...props, names: [...props.names] });
    expect(fixture.games).toHaveLength(1); expect(game.destroy).not.toHaveBeenCalled();
    expect(game.authoritativeState).toEqual({ turn: 8 });
  });
  it('still rebuilds for changed player configuration and releases the previous scene', () => {
    render(component, props); render(component, { ...props, seat: 1 });
    expect(fixture.games).toHaveLength(2); expect(fixture.games[0].destroy).toHaveBeenCalledExactlyOnceWith(true);
    expect(fixture.games[1].registry.set).toHaveBeenCalledWith('seat', 1);
  });
});
