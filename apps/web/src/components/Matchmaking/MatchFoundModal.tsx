import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Swords, Trophy, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import { useAuthStore } from '../../store/authStore';
import { getGameDefinition } from '@gaming-hub/shared';

export const MatchFoundModal: React.FC = () => {
  const navigate = useNavigate();
  const matchFound = useMultiplayerStore((s) => s.matchFound);
  const dismissMatchFound = useMultiplayerStore((s) => s.dismissMatchFound);
  const user = useAuthStore((s) => s.user);

  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!matchFound) {
      setCountdown(3);
      return;
    }

    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          handleEnterMatch();
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [matchFound]);

  if (!matchFound) return null;

  const def = getGameDefinition(matchFound.gameId);
  const myPlayer = matchFound.players.find((p) => p.userId === user?.id) ?? matchFound.players[0];
  const opponent = matchFound.players.find((p) => p.userId !== user?.id) ?? matchFound.players[1] ?? matchFound.players[0];

  const handleEnterMatch = () => {
    const gameId = matchFound.gameId;
    dismissMatchFound();
    navigate(`/games/${gameId}`);
  };

  const prizePool = Math.round(matchFound.entryFee * 2 * 0.9);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in zoom-in-95 duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 p-6 sm:p-8 text-center shadow-2xl shadow-amber-500/20">
        {/* Glow Header Accent */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 size-48 rounded-full bg-amber-500/20 blur-3xl pointer-events-none" />

        {/* Top Tag */}
        <div className="relative z-10 inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 px-4 py-1 text-xs font-black text-amber-400 mb-4 animate-pulse">
          <Sparkles className="size-3.5" /> OPPONENT FOUND!
        </div>

        {/* Game Title */}
        <h3 className="relative z-10 text-2xl font-black text-white flex items-center justify-center gap-2">
          <span>{def.icon}</span> {def.name}
        </h3>
        <p className="relative z-10 text-xs text-slate-400 mt-1">
          🪙 {matchFound.entryFee} Entry Fee · 🏆 {prizePool > 0 ? `${prizePool} Coins Prize` : 'Practice'}
        </p>

        {/* VS Layout */}
        <div className="relative z-10 mt-6 grid grid-cols-3 items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          {/* You */}
          <div className="flex flex-col items-center">
            <div className="size-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center font-black text-indigo-300 text-xl overflow-hidden">
              {myPlayer.avatarUrl ? (
                <img src={myPlayer.avatarUrl} alt="You" className="size-full object-cover" />
              ) : (
                myPlayer.displayName?.[0] || 'Y'
              )}
            </div>
            <span className="mt-2 text-xs font-bold text-slate-200 truncate max-w-[100px]">
              {myPlayer.displayName || 'You'}
            </span>
            <span className="text-[10px] text-indigo-400 font-bold uppercase">YOU</span>
          </div>

          {/* VS Badge */}
          <div className="flex flex-col items-center justify-center space-y-1">
            <div className="size-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black text-xs">
              VS
            </div>
            <span className="text-[10px] text-slate-500 font-mono">1v1 Online</span>
          </div>

          {/* Opponent */}
          <div className="flex flex-col items-center">
            <div className="size-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center font-black text-rose-300 text-xl overflow-hidden">
              {opponent.avatarUrl ? (
                <img src={opponent.avatarUrl} alt="Opponent" className="size-full object-cover" />
              ) : (
                opponent.displayName?.[0] || 'O'
              )}
            </div>
            <span className="mt-2 text-xs font-bold text-slate-200 truncate max-w-[100px]">
              {opponent.displayName || 'Opponent'}
            </span>
            <span className="text-[10px] text-rose-400 font-bold uppercase">OPPONENT</span>
          </div>
        </div>

        {/* Auto Enter Countdown & Button */}
        <div className="relative z-10 mt-6 space-y-3">
          <button
            onClick={handleEnterMatch}
            className="w-full rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 active:scale-[0.98] py-3.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-xl shadow-amber-500/25 transition-all flex items-center justify-center gap-2"
          >
            <span>ENTER MATCH ({countdown}s)</span>
            <ArrowRight className="size-4" />
          </button>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="size-3.5 text-emerald-400" />
            <span>Authoritative match created with 10-minute limit</span>
          </div>
        </div>
      </div>
    </div>
  );
};
