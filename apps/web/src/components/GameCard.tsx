import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { GameMetadata, GameId } from '../types';
import {
  Gamepad2,
  Flame,
  Swords,
  Sparkles,
  Bot,
  Globe,
  Coins,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

interface GameCardProps {
  game: GameMetadata;
  onPlay: (gameId: GameId, mode: 'ai' | 'multiplayer') => void;
}

export const GameCard: React.FC<GameCardProps> = ({ game, onPlay }) => {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="group relative rounded-2xl overflow-hidden glass-panel border border-slate-200 dark:border-slate-800 hover:border-accent-500/50 cursor-pointer transition-all duration-300"
      whileHover={reduceMotion ? undefined : { y: -6 }}
      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
    >
      <div className={`h-40 ${game.thumbnailUrl ? 'bg-slate-100 dark:bg-slate-900' : `bg-gradient-to-br ${game.bgGradient}`} p-4 flex flex-col justify-between relative overflow-hidden transition-colors duration-300`}>
        {game.thumbnailUrl && (
          <img
            src={game.thumbnailUrl}
            alt={game.title}
            className="absolute inset-0 w-full h-full object-cover opacity-100 dark:opacity-60 dark:group-hover:opacity-80 transition-opacity"
          />
        )}
        {!game.thumbnailUrl && (
          <Gamepad2 className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 text-white transform -rotate-12" />
        )}

        <div className="flex justify-between items-start z-10">
          <Badge variant="outline" className="bg-black/40 text-white ring-white/20 border-white/10">
            {game.category}
          </Badge>
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
            <Swords className="w-3.5 h-3.5 text-accent-400" /> {game.players}
          </span>
          <span className="flex items-center gap-1 font-semibold text-amber-400">
            <Coins className="w-3.5 h-3.5" /> Entry: {game.minEntryFee}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={() => onPlay(game.id, 'ai')}>
            <Bot className="w-3.5 h-3.5 text-emerald-400" /> VS AI
          </Button>
          <Button variant="primary" size="sm" onClick={() => onPlay(game.id, 'multiplayer')}>
            <Globe className="w-3.5 h-3.5" /> Live Match
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
