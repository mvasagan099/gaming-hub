import React from 'react';
import type { PlayerState } from '../types/game';
import { Dices, RefreshCcw } from 'lucide-react';

interface GameUIProps {
  turnPlayer: PlayerState;
  diceValue: number;
  isRolling: boolean;
  winner: PlayerState | null;
  logs: string[];
  onRollDice: () => void;
  onRestart: () => void;
}

export const GameUI: React.FC<GameUIProps> = ({
  turnPlayer,
  diceValue,
  isRolling,
  winner,
  logs,
  onRollDice,
  onRestart
}) => {
  return (
    <div className="flex flex-col items-center gap-6 glass-panel p-6 rounded-3xl border border-slate-800 w-full max-w-xs shadow-2xl">
      <div className="text-center">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">CURRENT TURN</span>
        <div className="mt-1 px-4 py-1.5 rounded-full font-black text-sm uppercase inline-flex items-center gap-2 bg-slate-900 border border-slate-700">
          <span>{turnPlayer.avatar}</span>
          <span style={{ color: turnPlayer.color }}>{turnPlayer.name}</span>
        </div>
      </div>

      {/* Dice Display */}
      <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950 border-2 border-slate-700 flex items-center justify-center text-4xl font-black text-amber-400 shadow-2xl transition-transform ${
        isRolling ? 'rotate-180 scale-110' : ''
      }`}>
        {diceValue}
      </div>

      <button
        disabled={turnPlayer.isAI || isRolling || !!winner}
        onClick={onRollDice}
        className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl transition-all ${
          !turnPlayer.isAI && !isRolling && !winner
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 transform hover:scale-[1.02]'
            : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
        }`}
      >
        <Dices className="w-5 h-5" /> ROLL DICE
      </button>

      {winner && (
        <div className="text-center bg-amber-500/20 border border-amber-500 p-4 rounded-2xl w-full">
          <p className="font-extrabold text-amber-400 text-sm">🎉 {winner.name} WINS!</p>
          <button
            onClick={onRestart}
            className="mt-3 w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2"
          >
            <RefreshCcw className="w-3.5 h-3.5" /> RESTART MATCH
          </button>
        </div>
      )}

      {/* Game Event Logs */}
      <div className="w-full bg-slate-900/90 p-3 rounded-2xl border border-slate-800 text-left space-y-1">
        <p className="text-[10px] font-bold text-slate-400 uppercase">Match Activity Log</p>
        {logs.map((log, idx) => (
          <p key={idx} className="text-[11px] text-slate-300 line-clamp-1">{log}</p>
        ))}
      </div>
    </div>
  );
};
