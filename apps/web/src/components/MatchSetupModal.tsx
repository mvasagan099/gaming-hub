import React, { useState } from 'react';
import type { GameMetadata, GameId } from '../types';
import { Bot, Swords, X, Trophy } from 'lucide-react';

interface GameModalProps {
  game: GameMetadata | null;
  onClose: () => void;
  onStartGame: (gameId: GameId, mode: 'ai' | 'multiplayer', stake: number) => void;
}

export const MatchSetupModal: React.FC<GameModalProps> = ({ game, onClose, onStartGame }) => {
  if (!game) return null;

  const [selectedMode, setSelectedMode] = useState<'ai' | 'multiplayer'>('multiplayer');
  const [stake, setStake] = useState<number>(game.minEntryFee);

  const stakes = [game.minEntryFee, game.minEntryFee * 2, game.minEntryFee * 5, game.minEntryFee * 10];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden transition-colors duration-300">
        {/* Header decoration */}
        <div className={`absolute top-0 left-0 right-0 h-2 bg-gradient-to-r ${game.bgGradient}`} />

        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mt-2 mb-6">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            {game.category}
          </span>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-2 transition-colors">{game.title}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 transition-colors">{game.description}</p>
        </div>

        {/* Mode Selector */}
        <div className="space-y-4">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider transition-colors">Select Mode</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSelectedMode('multiplayer')}
              className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${
                selectedMode === 'multiplayer'
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-700 dark:text-white shadow-lg shadow-indigo-500/10'
                  : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <Swords className={`w-6 h-6 ${selectedMode === 'multiplayer' ? 'text-indigo-400' : ''}`} />
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

          {/* Stake selector */}
          <div className="pt-2 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider transition-colors">Select Entry Stake</span>
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

        <button
          onClick={() => onStartGame(game.id, selectedMode, stake)}
          className="w-full mt-6 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-extrabold text-sm tracking-wide shadow-xl shadow-indigo-500/25 transition-all transform hover:scale-[1.01]"
        >
          {selectedMode === 'multiplayer' ? 'MATCH & PLAY NOW' : 'START PRACTICE GAME'}
        </button>
      </div>
    </div>
  );
};
