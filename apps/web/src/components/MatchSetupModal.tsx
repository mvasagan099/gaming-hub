import React, { useState } from 'react';
import type { GameMetadata, GameId } from '../types';
import { Bot, Swords, Trophy } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

interface GameModalProps {
  game: GameMetadata | null;
  onClose: () => void;
  onStartGame: (gameId: GameId, mode: 'ai' | 'multiplayer', stake: number) => void;
}

export const MatchSetupModal: React.FC<GameModalProps> = ({ game, onClose, onStartGame }) => {
  const [selectedMode, setSelectedMode] = useState<'ai' | 'multiplayer'>('multiplayer');
  const [stake, setStake] = useState<number>(game?.minEntryFee ?? 100);

  if (!game) return null;

  const stakes = [game.minEntryFee, game.minEntryFee * 2, game.minEntryFee * 5, game.minEntryFee * 10];

  return (
    <Modal
      isOpen={!!game}
      onClose={onClose}
      description={game.description}
    >
      <div className={`absolute top-0 left-0 right-0 h-2 bg-gradient-to-r ${game.bgGradient}`} />

      <div className="text-center mt-2 mb-6">
        <Badge variant="accent">{game.category}</Badge>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-2 transition-colors">{game.title}</h2>
      </div>

      <div className="space-y-4">
        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider transition-colors">
          Select Mode
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setSelectedMode('multiplayer')}
            className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${
              selectedMode === 'multiplayer'
                ? 'bg-accent-500/20 border-accent-500 text-accent-700 dark:text-white shadow-lg shadow-accent-500/10'
                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <Swords className={`w-6 h-6 ${selectedMode === 'multiplayer' ? 'text-accent-400' : ''}`} />
            <div className="text-center">
              <p className="text-sm font-bold">Online PVP</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 transition-colors">Match with Real Players</p>
            </div>
          </button>

          <button
            onClick={() => setSelectedMode('ai')}
            className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${
              selectedMode === 'ai'
                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-700 dark:text-white shadow-lg shadow-emerald-500/10'
                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <Bot className={`w-6 h-6 ${selectedMode === 'ai' ? 'text-emerald-400' : ''}`} />
            <div className="text-center">
              <p className="text-sm font-bold">Practice AI</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 transition-colors">Solo Play vs Bot</p>
            </div>
          </button>
        </div>

        <div className="pt-2 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider transition-colors">
              Select Entry Stake
            </span>
            <span className="text-amber-400 font-bold flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5" /> Prize: {stake * 1.8} Coins
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {stakes.map((val) => (
              <button
                key={val}
                onClick={() => setStake(val)}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  stake === val
                    ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                🪙 {val}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button
        fullWidth
        size="lg"
        className="mt-6 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 shadow-xl shadow-accent-500/25"
        onClick={() => onStartGame(game.id, selectedMode, stake)}
      >
        {selectedMode === 'multiplayer' ? 'MATCH & PLAY NOW' : 'START PRACTICE GAME'}
      </Button>
    </Modal>
  );
};
