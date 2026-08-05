import React from 'react';
import { useUserStore } from '../../store/useUserStore';
import { Award, ShieldCheck, Trophy } from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { username, avatar, coins, gems, level } = useUserStore();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="glass-panel p-8 rounded-3xl border border-slate-200 dark:border-slate-800 text-center space-y-4 transition-colors duration-300">
        <div className="w-24 h-24 rounded-3xl bg-indigo-100 dark:bg-indigo-600/20 border-2 border-indigo-500 flex items-center justify-center text-5xl mx-auto shadow-2xl transition-colors duration-300">
          {avatar}
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white transition-colors duration-300">{username}</h2>
          <p className="text-xs text-indigo-400 font-bold uppercase tracking-wider">Level {level} Competitor</p>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800 transition-colors duration-300">
          <div className="bg-slate-50 dark:bg-slate-900/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <p className="text-slate-500 dark:text-slate-400 text-xs transition-colors duration-300">Coins Balance</p>
            <p className="text-xl font-black text-amber-400 mt-1">🪙 {coins.toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 transition-colors duration-300">
            <p className="text-slate-500 dark:text-slate-400 text-xs transition-colors duration-300">Gems</p>
            <p className="text-xl font-black text-cyan-400 mt-1">💎 {gems}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
