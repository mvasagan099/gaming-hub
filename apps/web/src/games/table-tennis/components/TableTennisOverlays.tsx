import React from 'react';
import { Trophy, XCircle, RotateCcw, Sparkles, Zap, LogOut, Flame } from 'lucide-react';

interface TableTennisOverlaysProps {
  isGameOver: boolean;
  winner: 1 | 2 | null;
  mySeat: number | null;
  p1Score: number;
  p2Score: number;
  p1Name: string;
  p2Name: string;
  isMultiplayer: boolean;
  endReason: string | null;
  isMatchPoint: boolean;
  isDeuce: boolean;
  pointAnimation: { winner: number; reason: string } | null;
  isServing: boolean;
  currentServer: 1 | 2;
  rallyCount?: number;
  onServe?: () => void;
  onReplay: () => void;
  onExit: () => void;
}

export const TableTennisOverlays: React.FC<TableTennisOverlaysProps> = ({
  isGameOver,
  winner,
  mySeat,
  p1Score,
  p2Score,
  p1Name,
  p2Name,
  isMultiplayer,
  endReason,
  isMatchPoint,
  isDeuce,
  pointAnimation,
  isServing,
  currentServer,
  rallyCount = 0,
  onServe,
  onReplay,
  onExit,
}) => {
  const isMyServe = (!isMultiplayer && currentServer === 1) || (isMultiplayer && mySeat !== null && currentServer === (mySeat === 0 ? 1 : 2));
  const isMeWinner = winner !== null && winner === (mySeat === 0 ? 1 : 2);
  const isDraw = winner === null;

  return (
    <>
      {/* ── 1. Floating Rally Counter (Appears during long rallies >= 4) ── */}
      {rallyCount >= 4 && !isGameOver && !isServing && (
        <div className="absolute top-16 lg:top-4 left-1/2 -translate-x-1/2 pointer-events-none z-20 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-slate-900/85 border border-sky-500/50 backdrop-blur-md px-4 py-1 rounded-full shadow-[0_0_20px_rgba(14,165,233,0.3)] flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
            <span className="text-xs font-black text-sky-300 uppercase tracking-widest font-mono">
              RALLY {rallyCount}
            </span>
          </div>
        </div>
      )}

      {/* ── 2. Match Point / Deuce Floating Badges ── */}
      {isMatchPoint && !isGameOver && (
        <div className="absolute top-16 lg:top-4 left-1/2 -translate-x-1/2 pointer-events-none z-20 animate-in fade-in duration-200">
          <div className="bg-amber-500/20 border border-amber-500/60 backdrop-blur-md px-4 py-1 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.35)] flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
            <span className="text-xs font-black text-amber-400 uppercase tracking-widest">Match Point!</span>
          </div>
        </div>
      )}

      {isDeuce && !isGameOver && !isMatchPoint && (
        <div className="absolute top-16 lg:top-4 left-1/2 -translate-x-1/2 pointer-events-none z-20 animate-in fade-in duration-200">
          <div className="bg-purple-500/20 border border-purple-500/60 backdrop-blur-md px-4 py-1 rounded-full flex items-center gap-1.5 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
            <Zap className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs font-black text-purple-300 uppercase tracking-widest">Deuce (Win by 2)</span>
          </div>
        </div>
      )}

      {/* ── 3. Point Scored Alert Banner ── */}
      {pointAnimation && (
        <div className="absolute top-20 lg:top-14 left-1/2 -translate-x-1/2 pointer-events-none z-30 animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-slate-900/90 border-2 border-emerald-500/60 backdrop-blur-md px-5 py-2 rounded-2xl shadow-[0_0_25px_rgba(16,185,129,0.35)] flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400 animate-pulse" />
            <p className="text-xs font-black text-emerald-300 uppercase tracking-wider">
              {pointAnimation.winner === 0 ? p1Name : p2Name} Scored!
            </p>
          </div>
        </div>
      )}

      {/* ── 4. Compact Premium Serve Indicator (Interactive bottom pill) ── */}
      {isServing && !isGameOver && (
        <div className="absolute bottom-6 sm:bottom-8 lg:bottom-5 left-1/2 -translate-x-1/2 z-30 animate-in fade-in duration-200">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isMyServe && onServe) {
                onServe();
              }
            }}
            disabled={!isMyServe}
            className={`px-4 sm:px-6 py-1.5 sm:py-2 rounded-full backdrop-blur-md border shadow-2xl flex items-center gap-2 transition-all transform ${
              isMyServe
                ? 'bg-emerald-950/90 hover:bg-emerald-900 border-emerald-500/80 text-emerald-300 shadow-emerald-500/30 cursor-pointer active:scale-95 animate-pulse'
                : 'bg-slate-900/80 border-slate-700 text-slate-400 cursor-default'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${isMyServe ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
            <span className="text-xs sm:text-sm font-black uppercase tracking-wider">
              {isMyServe ? 'YOUR SERVE' : 'OPPONENT SERVING'}
            </span>
            {isMyServe && (
              <span className="text-[10px] sm:text-xs text-emerald-300 font-bold bg-emerald-800/60 px-2 py-0.5 rounded-full ml-1">
                Tap to Serve
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── 5. Victory / Defeat Modal ── */}
      {isGameOver && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in select-none">
          <div className={`
            relative flex flex-col items-center w-full max-w-sm p-5 sm:p-7 my-auto max-h-[90vh] overflow-y-auto custom-scrollbar
            bg-slate-900/95 backdrop-blur-2xl
            border-2 rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.9)]
            transform animate-in zoom-in-95 duration-200
            ${isMeWinner ? 'border-emerald-500/60 shadow-emerald-500/20' : isDraw ? 'border-amber-500/60' : 'border-rose-500/60 shadow-rose-500/20'}
          `}>
            {/* Top Floating Badge */}
            <div className={`
              w-16 h-16 rounded-2xl flex items-center justify-center border-2 mb-3 shadow-lg transform -translate-y-2
              ${isMeWinner
                ? 'bg-gradient-to-tr from-emerald-500/30 to-emerald-400/10 border-emerald-500/70 shadow-emerald-500/30 animate-bounce'
                : isDraw
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-400'
                  : 'bg-gradient-to-tr from-rose-500/30 to-rose-400/10 border-rose-500/70 shadow-rose-500/30'
              }
            `}>
              {isMeWinner ? (
                <Trophy className="w-9 h-9 text-emerald-400" />
              ) : (
                <XCircle className="w-9 h-9 text-rose-400" />
              )}
            </div>

            {/* Outcome Header */}
            <h2 className={`
              text-2xl sm:text-3xl font-black tracking-wider uppercase text-center
              ${isMeWinner ? 'text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]' : isDraw ? 'text-amber-400' : 'text-rose-400 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]'}
            `}>
              {isDraw ? 'MATCH DRAW!' : isMeWinner ? 'VICTORY!' : 'DEFEAT!'}
            </h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center mt-0.5 mb-4">
              {endReason === 'TIME_EXPIRED' ? 'Time Expired' : 'Match Concluded'}
            </p>

            {/* Final Match Score Bento Box */}
            <div className="w-full p-4 bg-slate-950/80 border border-slate-800 rounded-2xl mb-4 shadow-inner">
              <div className="flex items-center justify-around">
                <div className="text-center">
                  <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider truncate max-w-[90px]">{p1Name}</p>
                  <p className="text-3xl font-black font-mono text-white mt-1">{String(p1Score).padStart(2, '0')}</p>
                </div>
                <span className="text-xl font-black text-slate-600">—</span>
                <div className="text-center">
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider truncate max-w-[90px]">{p2Name}</p>
                  <p className="text-3xl font-black font-mono text-white mt-1">{String(p2Score).padStart(2, '0')}</p>
                </div>
              </div>
            </div>

            {/* Practice Reward Badge */}
            {isMeWinner && !isMultiplayer && (
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
                <RotateCcw className="w-4 h-4" /> {isMultiplayer ? 'Request Rematch' : 'Play Again'}
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
      )}
    </>
  );
};

export default TableTennisOverlays;
