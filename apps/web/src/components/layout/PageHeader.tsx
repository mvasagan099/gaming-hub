import { Search, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { GAMES_DATA } from '../../data/games';
import { useUIStore } from '../../store/uiStore';

const STATIC_TITLES: Record<string, string> = {
  '/': 'Home',
  '/leaderboard': 'Leaderboard',
  '/wallet': 'Wallet',
  '/profile': 'Profile',
  '/settings': 'Settings',
};

export default function PageHeader() {
  const location = useLocation();
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);

  const segments = location.pathname.split('/').filter(Boolean);
  let title = STATIC_TITLES[location.pathname] ?? '';
  let trail: { label: string; to: string }[] = [];

  if (!title) {
    const game = GAMES_DATA.find((g) => g.slug === segments[segments.length - 1]);
    if (segments[0] === 'games' || segments[0] === 'game') {
      trail = [{ label: 'Games', to: '/' }];
      if (game) title = game.name;
    } else if (segments[0] === 'lobby') {
      trail = [
        { label: 'Games', to: '/' },
        { label: game?.name ?? 'Game', to: game ? `/games/${game.slug}` : '/' },
      ];
      title = 'Lobby';
    } else {
      title = segments.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' / ');
    }
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate">{title}</h1>
        {trail.length > 0 && (
          <nav aria-label="Breadcrumb" className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <Link to="/" className="hover:text-accent-500">
              Home
            </Link>
            {trail.map((crumb) => (
              <span key={crumb.label} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                <Link to={crumb.to} className="hover:text-accent-500">
                  {crumb.label}
                </Link>
              </span>
            ))}
          </nav>
        )}
      </div>

      <button
        onClick={() => setPaletteOpen(true)}
        className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:border-accent-500/50 transition-colors"
        aria-label="Open search"
      >
        <Search className="w-3.5 h-3.5" />
        <span>Search…</span>
        <kbd className="rounded border border-slate-200 dark:border-slate-700 px-1.5 text-[10px] font-semibold">
          Ctrl K
        </kbd>
      </button>
    </div>
  );
}
