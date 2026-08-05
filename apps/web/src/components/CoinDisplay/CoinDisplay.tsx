import React from 'react';
import { Coins, Gem } from 'lucide-react';

interface CoinDisplayProps {
  coins: number;
  gems?: number;
}

export const CoinDisplay: React.FC<CoinDisplayProps> = ({ coins, gems = 0 }) => {
  return (
    <div className="flex items-center gap-3 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-extrabold shadow-inner">
      <span className="text-amber-400 flex items-center gap-1">
        <Coins className="w-4 h-4" /> {coins.toLocaleString()}
      </span>
      <span className="text-slate-700">|</span>
      <span className="text-cyan-400 flex items-center gap-1">
        <Gem className="w-4 h-4" /> {gems}
      </span>
    </div>
  );
};
