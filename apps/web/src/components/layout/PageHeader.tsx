import { Search, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { GAMES_DATA } from '../../data/games';
import { useUIStore } from '../../store/uiStore';
import { MobileBackButton } from './MobileBackButton';

const STATIC_TITLES: Record<string, string> = {
  '/': 'Home',
  '/leaderboard': 'Leaderboard',
  '/wallet': 'Wallet',
  '/profile': 'Profile',
  '/profile/security': 'Security Settings',
  '/profile/tournaments': 'My Tournaments',
  '/profile/history': 'Match History',
  '/profile/stats': 'Statistics',
  '/profile/activity': 'Activity Shortcuts',
  '/settings': 'Settings',
  '/achievements': 'Achievements',
  '/friends': 'Friends',
  '/tournaments': 'Tournaments',
  '/tournaments/history': 'Tournament History',
  '/tournaments/leaderboard': 'Tournament Leaderboard',
  '/messages': 'Messages',
  '/notifications': 'Notifications',
  '/announcements': 'Announcements',
  '/referrals': 'Referrals',
  '/tickets': 'Support',
  '/kyc': 'Identity Verification',
  '/kyc/verify': 'Verify Identity',
  '/search': 'Search',
};

export default function PageHeader() {
  const location = useLocation();
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);

  const segments = location.pathname.split('/').filter(Boolean);
  let title = STATIC_TITLES[location.pathname] ?? '';
  let trail: { label: string; to: string }[] = [];

  // If on /profile with ?tab= query parameter, refine title
  if (location.pathname === '/profile') {
    const tab = new URLSearchParams(location.search).get('tab');
    if (tab === 'security') title = 'Security Settings';
    else if (tab === 'tournaments') title = 'My Tournaments';
    else if (tab === 'history') title = 'Match History';
    else if (tab === 'stats') title = 'Statistics';
    else if (tab === 'activity') title = 'Activity Shortcuts';
  }

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
    <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
      <div className="min-w-0 shrink-0">
        <div className="flex items-center gap-2.5">
          <MobileBackButton />
          <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight truncate">{title}</h1>
        </div>
        {trail.length > 0 && (
          <nav aria-label="Breadcrumb" className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <Link to="/" className="hover:text-accent-500 transition-colors">
              Home
            </Link>
            {trail.map((crumb) => (
              <span key={crumb.label} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                <Link to={crumb.to} className="hover:text-accent-500 transition-colors">
                  {crumb.label}
                </Link>
              </span>
            ))}
          </nav>
        )}
      </div>

      {/* Centered Search Button - Visible on both mobile and desktop */}
      <div className="flex-1 flex justify-center w-full sm:w-auto sm:px-4">
        <button
          onClick={() => setPaletteOpen(true)}
          className="w-full sm:w-72 md:w-80 flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 sm:py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:border-accent-500/50 hover:shadow-xs transition-all cursor-pointer shadow-xs"
          aria-label="Open search (Ctrl K)"
          title="Search games, players, tournaments... (Ctrl K)"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">Search games, players...</span>
          </div>
          <kbd className="hidden sm:inline-block shrink-0 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Right spacer for symmetric alignment on desktop */}
      <div className="hidden sm:block min-w-0 shrink-0 w-16" aria-hidden="true" />
    </div>
  );
}
