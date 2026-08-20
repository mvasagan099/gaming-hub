import React from 'react';
import { Trophy, XCircle, RotateCcw, Sparkles, Award, Zap, LogOut, Flame, Shield, ArrowRight } from 'lucide-react';

interface CricketOverlaysProps {
  isGameOver: boolean;
  isWin: boolean;
  isDraw?: boolean;
  isInningsBreak?: boolean;
  score: number;
  wickets: number;
  overs: string;
  target?: number | null;
  wonBy?: string;
  isMultiplayer: boolean;
  onReplay: () => void;
  onExit: () => void;
}

export const CricketOverlays: React.FC<CricketOverlaysProps> = ({
  isGameOver,
  isWin,
  isDraw,
  isInningsBreak,
  score,
  wickets,
  overs,
  target,
  wonBy,
  isMultiplayer,
  onReplay,
  onExit,
}) => {
  if (!isGameOver && !isInningsBreak) return null;

  const title = isInningsBreak
    ? 'INNINGS COMPLETE!'
    : isWin
      ? 'MATCH VICTORY!'
      : isDraw
        ? 'MATCH TIED!'
        : 'MATCH DEFEAT';

  const subtitle = isInningsBreak
    ? `Target: ${target ?? score + 1} Runs`
    : wonBy
      ? wonBy
      : isWin
        ? 'Outstanding Batting & Bowling!'
        : 'Better luck next time!';

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in select-none">
      {/* Ambient background glow */}
      <div className={`pointer-events-none absolute w-96 h-96 rounded-full blur-3xl opacity-40 ${
        isWin || isInningsBreak ? 'bg-amber-500' : 'bg-rose-600'
      }`} />

      {/* Main Glassmorphic Modal */}
      <div className={`
        relative flex flex-col items-center w-full max-w-sm p-6 sm:p-7
        bg-slate-900/95 backdrop-blur-2xl
        border-2 rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.9)]
        transform animate-in zoom-in-95 duration-200
        ${isWin || isInningsBreak ? 'border-amber-500/60 shadow-amber-500/20' : 'border-rose-500/60 shadow-rose-500/20'}
      `}>
        {/* Floating Top Badge */}
        <div className={`
          w-16 h-16 rounded-2xl flex items-center justify-center border-2 mb-3 shadow-lg transform -translate-y-2
          ${isWin || isInningsBreak
            ? 'bg-gradient-to-tr from-amber-500/30 to-amber-400/10 border-amber-500/70 shadow-amber-500/30 animate-bounce'
            : 'bg-gradient-to-tr from-rose-500/30 to-rose-400/10 border-rose-500/70 shadow-rose-500/30'
          }
        `}>
          {isWin || isInningsBreak ? (
            <Trophy className="w-9 h-9 text-amber-400" />
          ) : (
            <XCircle className="w-9 h-9 text-rose-400" />
          )}
        </div>

        {/* Outcome Header */}
        <h2 className={`
          text-2xl sm:text-3xl font-black tracking-wider uppercase text-center
          ${isWin || isInningsBreak ? 'text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]' : 'text-rose-400 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]'}
        `}>
          {title}
        </h2>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center mt-0.5 mb-4">
          {subtitle}
        </p>

        {/* Bento Stat Grid */}
        <div className="grid grid-cols-2 gap-2.5 w-full mb-4">
          {/* Final Score */}
          <div className="col-span-2 p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-center justify-between shadow-inner">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-500/40 text-amber-400">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scorecard</p>
                <p className="text-xs text-amber-400/80 font-semibold">Total Runs / Wickets</p>
              </div>
            </div>
            <span className="text-2xl font-black font-mono text-white tracking-tight">
              {score} <span className="text-sm font-bold text-slate-500">/ {wickets}</span>
            </span>
          </div>

          {/* Overs */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Overs</span>
            </div>
            <span className="text-lg font-black font-mono text-sky-400">
              {overs} <span className="text-[10px] text-slate-500 font-bold uppercase">Ov</span>
            </span>
          </div>

          {/* Target */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 mb-1">
              <Flame className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target</span>
            </div>
            <span className="text-lg font-black font-mono text-emerald-400">
              {target ? target : 'Set'}
            </span>
          </div>
        </div>

        {/* Practice Reward Badge */}
        {isWin && !isMultiplayer && (
          <div className="w-full py-2.5 px-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl font-bold text-xs text-emerald-400 mb-4 flex items-center justify-center gap-2 shadow-sm">
            <Sparkles className="w-4 h-4 animate-pulse" />
            <span>+50 Coins Practice Reward Claimed!</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 w-full">
          <button
            onClick={onReplay}
            className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.35)] transform hover:scale-[1.02] active:scale-[0.98] transition-all tracking-wider uppercase flex items-center justify-center gap-2"
          >
            {isInningsBreak ? (
              <>
                <ArrowRight className="w-4 h-4" /> Start 2nd Innings
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" /> {isMultiplayer ? 'Request Rematch' : 'Play Again'}
              </>
            )}
          </button>
          <button
            onClick={onExit}
            className="w-full py-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs rounded-xl border border-slate-700/80 transition-colors uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" /> Exit to Lobby
          </button>
        </div>
      </div>
    </div>
  );
};

export default CricketOverlays;
