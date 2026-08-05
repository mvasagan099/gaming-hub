import React, { useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CoinDisplay } from '../CoinDisplay/CoinDisplay';
import { AuthModal } from '../Modal/AuthModal';
import { useUserStore } from '../../store/useUserStore';

export const Navbar: React.FC = () => {
  const { username, coins, gems, avatar, level } = useUserStore();

  const [isAuthOpen, setIsAuthOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 glass-panel border-b border-slate-800/80 px-4 lg:px-8 py-3.5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Gamepad2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-wider text-white flex items-center gap-1.5">
              GAMING<span className="text-indigo-500">HUB</span>
            </h1>
            <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Unified Arena</p>
          </div>
        </Link>

        <div className="flex items-center gap-4">
          <CoinDisplay coins={coins} gems={gems} />

          <button
            onClick={() => setIsAuthOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 hover:border-indigo-500 transition-all text-left"
          >
            <span className="text-lg">{avatar}</span>
            <div className="hidden sm:block">
              <p className="text-xs font-bold text-white leading-tight">{username}</p>
              <p className="text-[9px] text-indigo-300 font-semibold">Lvl {level}</p>
            </div>
          </button>
        </div>
      </header>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </>
  );
};
