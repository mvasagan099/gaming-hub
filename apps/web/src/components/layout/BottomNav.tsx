import { Home, Trophy, Wallet, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const items = [
  { name: 'Home', icon: Home, path: '/' },
  { name: 'Leaderboard', icon: Trophy, path: '/leaderboard' },
  { name: 'Wallet', icon: Wallet, path: '/wallet' },
  { name: 'Profile', icon: User, path: '/profile' },
];

export default function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-4">
        {items.map((item) => (
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
