import React from 'react';
import { Gamepad2, Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full glass-panel border-t border-slate-800/80 px-6 py-4 mt-12 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-3">
      <div className="flex items-center gap-2 font-bold text-white">
        <Gamepad2 className="w-4 h-4 text-indigo-500" /> GAMING HUB © 2026
      </div>
      <div className="flex items-center gap-1">
        Built with <Heart className="w-3.5 h-3.5 text-rose-500 fill-current mx-1" /> for competitive gaming.
      </div>
    </footer>
  );
};
