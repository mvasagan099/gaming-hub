import { Home, Trophy, Wallet, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useFeatureFlagsStore } from '../../store/featureFlagsStore';

const items = [
  { name: 'Home', icon: Home, path: '/', flag: null as string | null },
  { name: 'Leaderboard', icon: Trophy, path: '/leaderboard', flag: 'social.leaderboards' },
  { name: 'Wallet', icon: Wallet, path: '/wallet', flag: null },
  { name: 'Profile', icon: User, path: '/profile', flag: null },
];

export default function BottomNav() {
  const flags = useFeatureFlagsStore((s) => s.flags);
  const visibleItems = items.filter((item) =>
    item.flag ? (flags ? flags[item.flag] !== false : true) : true,
  );
  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}
      >
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
                isActive
                  ? 'text-accent-500'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`
            }
            aria-label={item.name}
          >
            <item.icon className="w-5 h-5" />
            <span>{item.name}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
