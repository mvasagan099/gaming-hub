import React, { useEffect, useRef, useState } from 'react';
import type { GameId } from '../types';
import { ArrowLeft, Copy, Check, Eye, Timer, Zap, Users, Globe, Lock, Coins } from 'lucide-react';
import { useMultiplayerStore } from '../store/multiplayerStore';

interface GameWrapperProps {
  title: string;
  gameId: GameId;
  mode: 'ai' | 'multiplayer';
  stake: number;
  onBack: () => void;
  children: React.ReactNode;
  isFullscreen?: boolean;
  isGameOver?: boolean;
  hideFloatingExitOnMobile?: boolean;
  hideFloatingExitOnDesktop?: boolean;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const GameWrapper: React.FC<GameWrapperProps> = ({
  title,
  gameId,
  mode,
  stake,
  onBack,
  children,
  isFullscreen = false,
  isGameOver = false,
  hideFloatingExitOnMobile = false,
  hideFloatingExitOnDesktop = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const room = useMultiplayerStore((s) => s.room);
  const startRef = useRef<number>(Date.now());

  // Visible exit controls request confirmation from the game route.
  const handleExitRequest = () => onBack();

  useEffect(() => {
    if (!room) return;
    startRef.current = room.createdAt
      ? new Date(room.createdAt).getTime()
      : Date.now();
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [room?.id]);

  const copyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const isRanked = room ? (room.settings as Record<string, unknown>)?.rated !== false : true;

  if (isFullscreen) {
    return (
      <div className="game-text-scale fixed inset-0 z-50 bg-[#060913] text-white flex flex-col overflow-hidden">
        {/* Floating Back / Exit button for Single Player & AI Fullscreen */}
        {!(mode === 'multiplayer' && room) && (
          <>
            {/* Desktop (>= lg): Exactly identical to existing styling & position */}
            {!hideFloatingExitOnDesktop && <div className="hidden lg:block absolute top-3 left-3 z-[65] pt-[env(safe-area-inset-top)]">
              <button
                type="button"
                onClick={handleExitRequest}
                aria-label="Exit Game"
                title="Exit Game"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/85 hover:bg-slate-800 text-slate-200 border border-slate-700/80 shadow-lg backdrop-blur-md text-xs font-bold transition-all hover:border-purple-500/50 hover:text-purple-300 active:scale-95 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-purple-400" />
                <span>Exit</span>
              </button>
            </div>}

            {/* Mobile (< lg): Sleek, compact 32px circular icon button (hidden if game has own mobile exit) */}
            {!hideFloatingExitOnMobile && (
              <div className="lg:hidden absolute top-2.5 left-2.5 z-[65] pt-[env(safe-area-inset-top)]">
                <button
                  type="button"
                  onClick={handleExitRequest}
                  aria-label="Exit Game"
                  title="Exit Game"
                  className="w-8 h-8 rounded-full bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 shadow-xl backdrop-blur-md flex items-center justify-center transition-all hover:border-purple-500/50 hover:text-purple-300 active:scale-90 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-purple-400" />
                </button>
              </div>
            )}
          </>
        )}

        {/* Compact HUD bar — top in multiplayer */}
        {mode === 'multiplayer' && room && (
          <div className="z-[65] flex items-center justify-between px-3 sm:px-4 py-2 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 flex-shrink-0 gap-2">
            {/* Multiplayer uses one shared exit; practice games may own their exit. */}
            <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink">
              <button
                type="button"
                aria-label="Exit Game"
                title="Exit Game"
                onClick={handleExitRequest}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors border border-slate-700 shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Exit</span>
              </button>
              <span className="text-xs sm:text-sm font-black text-white truncate max-w-[80px] sm:max-w-[140px] lg:max-w-none">{title}</span>
              <span className={`hidden md:inline-flex text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border ${
                isRanked
                  ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                  : 'bg-slate-700/60 text-slate-400 border-slate-600'
              }`}>
                {isRanked ? '⚡ Ranked' : 'Casual'}
              </span>
              <span className={`hidden lg:inline-flex text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                room.isPrivate
                  ? 'bg-slate-700/60 text-slate-400 border-slate-600'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
                {room.isPrivate ? <Lock className="w-2.5 h-2.5 inline mr-0.5" /> : <Globe className="w-2.5 h-2.5 inline mr-0.5" />}
                {room.isPrivate ? 'Private' : 'Public'}
              </span>
            </div>

            {/* Center / Right: room info chips */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Room code */}
              <button
                onClick={() => void copyCode()}
                className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-900/50 border border-slate-700 hover:border-indigo-500/50 transition-all group shrink-0"
                title="Copy room code"
              >
                <span className="hidden sm:inline text-[9px] text-slate-500">Code</span>
                <span className="font-mono font-black text-indigo-300 text-[10px] tracking-wider">{room.code}</span>
                {copied
                  ? <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                  : <Copy className="w-3 h-3 text-slate-400 group-hover:text-indigo-400 shrink-0" />
                }
              </button>
              {/* Timer */}
              <div className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 shrink-0">
                <Timer className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="font-mono font-black text-amber-300 text-[10px]">{formatElapsed(elapsed)}</span>
              </div>
              {/* Players */}
              <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 shrink-0">
                <Users className="w-3 h-3 text-sky-400 shrink-0" />
                <span className="text-[10px] font-black text-sky-300">{room.players.length}/{room.maxPlayers}</span>
              </div>
              {/* Stake */}
              <div className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded-lg bg-amber-900/30 border border-amber-700/30 shrink-0">
                <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="text-[10px] font-black text-amber-300 font-mono flex items-center gap-1">
                  <Coins className="w-3 h-3 text-amber-400" /> {stake}
                </span>
              </div>

            </div>
          </div>
        )}

        {/* Game content — 100% full screen edge-to-edge with 0 padding */}
        <div className="w-full h-full flex-1 min-h-0 relative overflow-hidden flex flex-col">
          {children}
        </div>

      </div>
    );
  }

  return (
    <div className="game-text-scale min-h-full w-full flex flex-col items-center justify-between p-2 relative overflow-y-auto custom-scrollbar">
      {/* Header bar */}
      <div className="w-full max-w-6xl flex flex-wrap sm:flex-nowrap items-center justify-between py-2.5 px-3 sm:px-6 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800 shadow-xl mb-4 z-20 gap-2 shrink-0">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            type="button"
            aria-label="Exit Game"
            title="Exit Game"
            onClick={handleExitRequest}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            <span className="hidden sm:inline">Exit</span>
          </button>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-1.5 sm:gap-2 truncate">
              <span className="truncate">{title}</span>
              <span className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider shrink-0 ${
                mode === 'multiplayer' ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
              }`}>
                {mode === 'multiplayer' ? 'PVP' : 'VS AI'}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {/* Multiplayer chips */}
          {mode === 'multiplayer' && room && (
            <>
              <button
                onClick={() => void copyCode()}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500/50 transition-colors text-xs"
                title="Copy room code"
              >
                <span className="text-slate-500 text-[9px]">Code</span>
                <span className="font-mono font-black text-indigo-600 dark:text-indigo-300 tracking-widest text-[10px] sm:text-xs">{room.code}</span>
                {copied ? <Check className="w-3 h-3 text-emerald-500 shrink-0" /> : <Copy className="w-3 h-3 text-slate-400 shrink-0" />}
              </button>
              <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-white">
                <Timer className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                <span className="font-mono font-black text-amber-600 dark:text-amber-300">{formatElapsed(elapsed)}</span>
              </div>
              {room.spectators.length > 0 && (
                <div className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-black text-slate-700 dark:text-slate-300">{room.spectators.length}</span>
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold">
            <span className="text-slate-500 dark:text-slate-400">Prize:</span>
            <span className="text-amber-500 dark:text-amber-400 flex items-center gap-1 font-extrabold">
              <Coins className="w-3.5 h-3.5 text-amber-400" /> {stake * 1.8}
            </span>
          </div>

        </div>
      </div>

      {/* Game canvas/board container */}
      <div className="w-full max-w-6xl flex-1 flex items-center justify-center relative my-auto py-2">
        {children}
      </div>

    </div>
  );
};
