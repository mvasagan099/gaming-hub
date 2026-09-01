import React from 'react';
import { Trophy, Shield, XCircle, RotateCcw, Sparkles, Flame, Zap, Award, LogOut, HelpCircle } from 'lucide-react';

interface BubbleShooterOverlaysProps {
  isWin: boolean;
  isGameOver: boolean;
  isLose: boolean;
  score: number;
  bestCombo: number;
  poppedCount: number;
  isMultiplayer?: boolean;
  winnerName?: string | null;
  showRules: boolean;
  onCloseRules: () => void;
  onReplay: () => void;
  onExit: () => void;
}

export const BubbleShooterOverlays: React.FC<BubbleShooterOverlaysProps> = ({
  isWin,
  isGameOver,
  isLose,
  score,
  bestCombo,
  poppedCount,
  isMultiplayer = false,
  winnerName,
  showRules,
  onCloseRules,
  onReplay,
  onExit,
}) => {
  // ── 1. Rules Modal ──
  if (showRules) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in select-none">
        <div className="relative flex flex-col items-center w-full max-w-sm p-6 sm:p-7 bg-slate-900/95 border-2 border-indigo-500/40 rounded-3xl shadow-[0_0_50px_rgba(99,102,241,0.25)]">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/50 mb-3 text-indigo-400">
            <HelpCircle className="w-8 h-8" />
          </div>

          <h2 className="text-2xl font-black uppercase tracking-wider text-white mb-1">How To Play</h2>
          <p className="text-[11px] text-indigo-400/80 font-bold uppercase tracking-widest mb-5">Bubble Match Tactics</p>

          <div className="space-y-2.5 w-full mb-6">
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 font-bold text-xs">
                3+
              </div>
              <p className="text-xs text-slate-300 font-medium">Match 3 or more same-color bubbles to pop them.</p>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-xs">
                ⬇️
              </div>
              <p className="text-xs text-slate-300 font-medium">Every 2 shots, the ceiling drops down one row!</p>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-sm">
                💣
              </div>
              <p className="text-xs text-slate-300 font-medium"><b>Bomb:</b> Destroys all surrounding bubbles.</p>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-sm">
                🌈
              </div>
              <p className="text-xs text-slate-300 font-medium"><b>Rainbow:</b> Wildcard matches any color.</p>
            </div>
          </div>

          <button
            onClick={onCloseRules}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-500 via-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-black text-xs uppercase rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.35)] transform hover:scale-[1.02] active:scale-[0.98] transition-all tracking-wider"
          >
            Start Slicing Bubbles
          </button>
        </div>
      </div>
    );
  }

  // ── 2. Victory / Defeat / Game Over Modal ──
  const isFinished = isWin || isGameOver || isLose;
  if (!isFinished) return null;

  const title = isWin
    ? 'VICTORY!'
    : isGameOver
      ? 'OUT OF SPACE!'
      : 'GAME OVER';

  const subtitle = isWin
    ? 'Board Cleared!'
    : winnerName
      ? `Winner: ${winnerName}`
      : 'Bubbles Hit The Bottom!';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-300 select-none">
      {/* Ambient background glow behind modal */}
      <div className={`pointer-events-none absolute w-96 h-96 rounded-full blur-3xl opacity-40 ${
        isWin ? 'bg-emerald-500' : 'bg-rose-600'
      }`} />

      {/* Main Glassmorphic Modal */}
      <div className={`
        relative flex flex-col items-center w-full max-w-sm p-5 sm:p-7 my-auto max-h-[90vh] overflow-y-auto custom-scrollbar
        bg-slate-900/95 backdrop-blur-2xl
        border-2 rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.9)]
        transform animate-in zoom-in-95 duration-200
        ${isWin ? 'border-emerald-500/60 shadow-emerald-500/20' : 'border-rose-500/60 shadow-rose-500/20'}
      `}>
        {/* Floating Top Badge */}
        <div className={`
          w-16 h-16 rounded-2xl flex items-center justify-center border-2 mb-3 shadow-lg transform -translate-y-2
          ${isWin
            ? 'bg-gradient-to-tr from-emerald-500/30 to-emerald-400/10 border-emerald-500/70 shadow-emerald-500/30 animate-bounce'
            : 'bg-gradient-to-tr from-rose-500/30 to-rose-400/10 border-rose-500/70 shadow-rose-500/30'
          }
        `}>
          {isWin ? (
            <Trophy className="w-9 h-9 text-emerald-400" />
          ) : (
            <XCircle className="w-9 h-9 text-rose-400" />
          )}
        </div>

        {/* Outcome Header */}
        <h2 className={`
          text-2xl sm:text-3xl font-black tracking-wider uppercase text-center
          ${isWin ? 'text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'text-rose-400 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]'}
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
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Final Score</p>
                <p className="text-xs text-amber-400/80 font-semibold">Total Points</p>
              </div>
            </div>
            <span className="text-2xl font-black font-mono text-white tracking-tight">
              {score.toLocaleString()}
            </span>
          </div>

          {/* Best Combo */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Best Combo</span>
            </div>
            <span className="text-lg font-black font-mono text-amber-400">
              {bestCombo > 0 ? `${bestCombo}x` : 'None'}
            </span>
          </div>

          {/* Popped Count */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 mb-1">
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Popped</span>
            </div>
            <span className="text-lg font-black font-mono text-white">
              {poppedCount} <span className="text-[10px] text-slate-500 font-bold uppercase">Bubbles</span>
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
            className="w-full py-3.5 bg-gradient-to-r from-emerald-500 via-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.35)] transform hover:scale-[1.02] active:scale-[0.98] transition-all tracking-wider uppercase flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> {isMultiplayer ? 'Rematch' : 'Play Again'}
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

export default BubbleShooterOverlays;
