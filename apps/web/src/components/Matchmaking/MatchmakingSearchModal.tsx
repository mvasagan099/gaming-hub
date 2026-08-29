import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Swords, X, ShieldAlert, Clock, Trophy, Loader2 } from 'lucide-react';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import { getGameDefinition, type GameId } from '@gaming-hub/shared';
import { useSettingsStore } from '../../store/settingsStore';

export const MatchmakingSearchModal: React.FC = () => {
  const location = useLocation();
  const matchmaking = useMultiplayerStore((s) => s.matchmaking);
  const leaveMatchmaking = useMultiplayerStore((s) => s.leaveMatchmaking);
  const room = useMultiplayerStore((s) => s.room);
  const gameState = useMultiplayerStore((s) => s.gameState);
  const matchFound = useMultiplayerStore((s) => s.matchFound);
  const siteSettings = useSettingsStore((s) => s.settings);

  const [waitElapsed, setWaitElapsed] = useState(0);
  const [cancelling, setCancelling] = useState(false);

  const matchmakingTimeout = siteSettings?.game?.matchmakingTimeoutSeconds ?? 90;

  // Determine if a match or game is active or player is already on the game view
  const isGamePage = location.pathname.startsWith('/games/') || location.pathname.startsWith('/game/');
  const isMatchActive = Boolean(room || gameState || matchFound || isGamePage);

  // Auto-dismiss and clear matchmaking queue state as soon as a match/room/game is active
  useEffect(() => {
    if (isMatchActive && matchmaking.queued) {
      useMultiplayerStore.setState({
        matchmaking: { queued: false, position: 0, gameId: null, stake: null, settings: {} },
        pendingRequeue: null,
      });
    }
  }, [isMatchActive, matchmaking.queued]);

  useEffect(() => {
    if (!matchmaking.queued || isMatchActive) {
      setWaitElapsed(0);
      setCancelling(false);
      return;
    }

    const start = Date.now();
    const interval = setInterval(() => {
      setWaitElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [matchmaking.queued, isMatchActive]);

  // Auto-cancel when client exceeds timeout
  useEffect(() => {
    if (matchmaking.queued && !isMatchActive && waitElapsed >= matchmakingTimeout) {
      void leaveMatchmaking();
    }
  }, [matchmaking.queued, isMatchActive, waitElapsed, matchmakingTimeout, leaveMatchmaking]);

  if (!matchmaking.queued || !matchmaking.gameId || isMatchActive) {
    return null;
  }

  const def = getGameDefinition(matchmaking.gameId);
  const secondsRemaining = Math.max(0, matchmakingTimeout - waitElapsed);
  const progressPercent = Math.min(100, (waitElapsed / matchmakingTimeout) * 100);

  const formatElapsed = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await leaveMatchmaking();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-gradient-to-b dark:from-slate-900/90 dark:via-slate-900/95 dark:to-slate-950 p-6 sm:p-8 text-center shadow-2xl shadow-indigo-500/10">
        {/* Animated radar rings background */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="absolute rounded-full border border-indigo-500/20"
              style={{
                width: `${i * 100}px`,
                height: `${i * 100}px`,
                animation: `ping ${i * 0.9 + 1.2}s cubic-bezier(0, 0, 0.2, 1) infinite`,
                animationDelay: `${i * 0.25}s`,
              }}
            />
          ))}
        </div>

        {/* Top bar with close button */}
        <div className="relative z-10 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-4">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] text-indigo-600 dark:text-indigo-400">
            <Swords className="size-3.5" /> Matchmaking Queue
          </div>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="rounded-full p-1 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer"
            title="Cancel Matchmaking"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Central Pulse Icon */}
        <div className="relative z-10 mx-auto mb-5 size-20 rounded-3xl bg-indigo-500/15 border border-indigo-500/30 dark:border-indigo-500/40 flex items-center justify-center shadow-xl shadow-indigo-500/20">
          <span className="text-3xl animate-bounce">{def.icon}</span>
        </div>

        {/* Game Title & Stake */}
        <h3 className="relative z-10 text-xl font-black text-slate-900 dark:text-white">Searching for Opponent</h3>
        <p className="relative z-10 text-sm font-bold text-slate-600 dark:text-slate-300 mt-1">
          {def.name}
        </p>

        {/* Info Badges */}
        <div className="relative z-10 mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="rounded-full bg-amber-50 dark:bg-slate-800/80 border border-amber-200 dark:border-slate-700 px-3 py-1 font-bold text-amber-700 dark:text-amber-400">
            🪙 {matchmaking.stake ?? 0} Coins Entry
          </span>
          {matchmaking.position > 0 && (
            <span className="rounded-full bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 px-3 py-1 font-bold text-indigo-700 dark:text-indigo-300">
              Queue Position: #{matchmaking.position}
            </span>
          )}
        </div>

        {/* Timer & Status */}
        <div className="relative z-10 mt-6 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Clock className="size-3.5 text-slate-400 dark:text-slate-500" /> Wait Time
            </span>
            <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
              {formatElapsed(waitElapsed)}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-r from-indigo-500 via-purple-500 to-amber-500 transition-all duration-1000"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Authoritative matching</span>
            <span className="text-amber-600 dark:text-amber-400/80 font-medium">Auto-cancels in {secondsRemaining}s</span>
          </div>
        </div>

        {/* Cancel Button */}
        <div className="relative z-10 mt-6">
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="w-full rounded-2xl bg-rose-600/90 hover:bg-rose-600 active:scale-[0.98] py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {cancelling ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Cancelling…
              </>
            ) : (
              'Cancel Matchmaking'
            )}
          </button>
          <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
            No entry fees are deducted while waiting in queue.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MatchmakingSearchModal;
