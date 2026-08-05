import React from 'react';
import type { GameMetadata, GameId } from '../types';
import { 
  Gamepad2, 
  Flame, 
  Swords, 
  Sparkles,
  Bot,
  Globe,
  Coins
} from 'lucide-react';

interface GameCardProps {
  game: GameMetadata;
  onPlay: (gameId: GameId, mode: 'ai' | 'multiplayer') => void;
}

export const GameCard: React.FC<GameCardProps> = ({ game, onPlay }) => {
  return (
    <div className="group relative rounded-2xl overflow-hidden glass-panel border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 cursor-pointer transition-all duration-300 transform hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-indigo-500/20">
      <div className={`h-40 ${game.thumbnailUrl ? 'bg-slate-100 dark:bg-slate-900' : `bg-gradient-to-br ${game.bgGradient}`} p-4 flex flex-col justify-between relative overflow-hidden transition-colors duration-300`}>
        {game.thumbnailUrl && (
          <img 
            src={game.thumbnailUrl} 
            alt={game.title} 
            className="absolute inset-0 w-full h-full object-cover opacity-100 dark:opacity-60 dark:group-hover:opacity-80 transition-opacity"
          />
        )}
        {/* Background icon pattern */}
        {!game.thumbnailUrl && (
          <Gamepad2 className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 text-white transform -rotate-12" />
        )}
        
        <div className="flex justify-between items-start z-10">
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-black/40 backdrop-blur-md text-white border border-white/10">
            {game.category}
          </span>
          <div className="flex items-center gap-1">
            {game.isHot && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-rose-500/80 text-white font-medium animate-pulse">
                <Flame className="w-3 h-3" /> HOT
              </span>
            )}
            {game.isNew && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/80 text-white font-medium">
                <Sparkles className="w-3 h-3" /> NEW
              </span>
            )}
          </div>
        </div>

        <div className="z-10">
          <h3 className="text-xl font-black text-white drop-shadow-md tracking-wide">{game.title}</h3>
          <p className="text-xs text-slate-200/80 line-clamp-1">{game.description}</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <Swords className="w-3.5 h-3.5 text-indigo-400" /> {game.players}
          </span>
          <span className="flex items-center gap-1 font-semibold text-amber-400">
            <Coins className="w-3.5 h-3.5" /> Entry: {game.minEntryFee}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button 
            onClick={() => onPlay(game.id, 'ai')}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
          >
            <Bot className="w-3.5 h-3.5 text-emerald-400" /> VS AI
          </button>
          <button 
            onClick={() => onPlay(game.id, 'multiplayer')}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02]"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-200" /> Live Match
          </button>
        </div>
      </div>
    </div>
  );
};
