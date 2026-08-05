import React from 'react';
import { NavLink } from 'react-router-dom';
import { Gamepad2, Trophy, User, Settings, Home, Swords } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const links = [
    { to: '/', label: 'Home', icon: Home },
    { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { to: '/profile', label: 'Profile', icon: User },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-16 lg:w-64 glass-panel border-r border-slate-800/80 p-4 flex flex-col justify-between hidden md:flex min-h-[calc(100vh-65px)]">
      <div className="space-y-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 hidden lg:block">Navigation</span>
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-2xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="hidden lg:block">{item.label}</span>
            </NavLink>
          );
        })}
      </div>

      <div className="p-3 bg-indigo-950/40 rounded-2xl border border-indigo-500/20 text-center hidden lg:block space-y-1">
        <p className="text-xs font-extrabold text-indigo-300">Season 1 LIVE</p>
        <p className="text-[10px] text-slate-400">Play & Earn 🪙 Rewards</p>
      </div>
    </aside>
  );
};
