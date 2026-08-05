import React, { useState } from 'react';
import type { GameId } from '../types';
import { ArrowLeft, Volume2, VolumeX, X } from 'lucide-react';

interface GameWrapperProps {
  title: string;
  gameId: GameId;
  mode: 'ai' | 'multiplayer';
  stake: number;
  onBack: () => void;
  children: React.ReactNode;
  isFullscreen?: boolean;
}

export const GameWrapper: React.FC<GameWrapperProps> = ({
  title,
  gameId,
  mode,
  stake,
  onBack,
  children,
  isFullscreen = false
}) => {
  const [isMuted, setIsMuted] = useState(false);

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-[#060913] flex items-center justify-center overflow-hidden">
        {/* Top right close button */}
        <button 
          onClick={onBack}
          className="absolute top-6 right-6 z-[60] flex items-center justify-center w-12 h-12 rounded-full bg-slate-800/50 hover:bg-rose-500/80 hover:text-white text-slate-300 transition-all border border-slate-700/50 shadow-2xl backdrop-blur-md group"
          title="Quit Game"
        >
          <X className="w-6 h-6 group-hover:scale-110 transition-transform" />
        </button>
        
        {/* Game content */}
        <div className="w-full h-full flex items-center justify-center relative p-2 sm:p-4">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col items-center justify-between p-2 relative overflow-hidden">
      {/* Header bar */}
      <div className="w-full max-w-6xl flex items-center justify-between py-3 px-6 rounded-2xl glass-panel border border-slate-800 shadow-xl mb-4 z-20">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors border border-slate-700"
          >
            <ArrowLeft className="w-4 h-4 text-indigo-400" /> Back to Lobby
          </button>
          <div>
            <h1 className="text-lg font-black text-white flex items-center gap-2">
              {title}
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                mode === 'multiplayer' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}>
                {mode === 'multiplayer' ? 'PVP Match' : 'VS AI'}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold">
            <span className="text-slate-400">Match Prize:</span>
            <span className="text-amber-400 flex items-center gap-1 font-extrabold">
              🪙 {stake * 1.8}
            </span>
          </div>

          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-indigo-400" />}
          </button>
        </div>
      </div>

      {/* Game canvas/board container */}
      <div className="w-full max-w-6xl flex-1 flex items-center justify-center relative">
        {children}
      </div>
    </div>
  );
};
