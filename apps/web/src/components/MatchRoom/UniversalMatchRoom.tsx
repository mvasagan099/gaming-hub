import { useRoomCountdown } from "../../hooks/useRoomCountdown";
import React, { useState, useEffect } from 'react';
import {
  Swords,
  Trophy,
  CheckCircle2,
  Clock,
  Wifi,
  WifiOff,
  AlertTriangle,
  ArrowLeft,
  Copy,
  Check,
  Zap,
  Shield,
  Loader2,
  Coins,
} from 'lucide-react';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import { useAuthStore } from '../../store/authStore';
import { getGameDefinition, type GameId } from '@gaming-hub/shared';

interface UniversalMatchRoomProps {
  gameId: GameId;
  mode?: 'casual' | 'ranked' | 'tournament';
  tournamentInfo?: {
    tournamentId: string;
    roundNumber: number;
    matchNumber: number;
    tournamentTitle?: string;
  } | null;
  onLeave?: () => void;
  onMatchStarted?: () => void;
}

export const UniversalMatchRoom: React.FC<UniversalMatchRoomProps> = ({
  gameId,
  mode = 'casual',
  tournamentInfo,
  onLeave,
  onMatchStarted,
}) => {
  const user = useAuthStore((s) => s.user);
  const room = useMultiplayerStore((s) => s.room);
  const legacyCountdown = useMultiplayerStore((s) => s.countdown);
  const countdown = useRoomCountdown(room, legacyCountdown);
  const setReady = useMultiplayerStore((s) => s.setReady);
  const leaveRoom = useMultiplayerStore((s) => s.leaveRoom);

  const [togglingReady, setTogglingReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const def = getGameDefinition(gameId);

  // Identify players
  const participants = room?.players.filter((p) => !p.isSpectator) ?? [];
  const myPlayer = participants.find((p) => p.id === user?.id) ?? null;
  const opponent = participants.find((p) => p.id !== user?.id) ?? null;
  const meReady = myPlayer?.isReady ?? false;
  const opponentReady = opponent?.isReady ?? false;

  useEffect(() => {
    if (room?.status === 'playing') {
      onMatchStarted?.();
    }
  }, [room?.status, onMatchStarted]);

  const handleToggleReady = async () => {
    if (!room || togglingReady) return;
    setTogglingReady(true);
    try {
      await setReady(!meReady);
    } catch {
      // Error handled by store
    } finally {
      setTogglingReady(false);
    }
  };

  const handleCopyCode = async () => {
    if (!room?.code) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore copy error
    }
  };

  const handleLeave = async () => {
    await leaveRoom();
    onLeave?.();
  };

  const prizePool =
    mode === 'tournament' ? 0 : Math.round((room?.stake ?? def.defaultStake) * 2 * 0.9);

  return (
    <div className="relative w-full max-w-4xl mx-auto p-4 sm:p-6 flex flex-col items-center justify-center min-h-[600px]">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />

      {/* Main Room Card */}
      <div className="relative z-10 w-full overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/90 via-slate-900/95 to-slate-950 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleLeave()}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-slate-800/60 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all"
            >
              <ArrowLeft className="size-3.5" /> Leave
            </button>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{def.icon}</span>
              <div>
                <h2 className="text-lg font-black text-white leading-tight">{def.name}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  {mode === 'tournament' ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[10px] font-black uppercase text-amber-300">
                      <Trophy className="size-3" /> Round {tournamentInfo?.roundNumber ?? 1}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-black uppercase text-indigo-300">
                      <Swords className="size-3" /> {mode === 'ranked' ? 'Ranked Match' : 'Casual 1v1'}
                    </span>
                  )}
                  {room?.isPrivate && (
                    <span className="rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                      Private Room
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Room Info Badges */}
          <div className="flex items-center gap-2 text-xs">
            {room?.code && (
              <button
                onClick={() => void handleCopyCode()}
                className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-1.5 font-mono font-bold text-indigo-300 hover:border-indigo-500/40 transition-colors"
                title="Copy Room Code"
              >
                <span className="text-[10px] text-slate-500">CODE:</span>
                <span>{room.code}</span>
                {copied ? (
                  <Check className="size-3.5 text-emerald-400" />
                ) : (
                  <Copy className="size-3.5 text-slate-500" />
                )}
              </button>
            )}
            {mode !== 'tournament' && (
              <div className="flex items-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 font-bold text-amber-300">
                <Zap className="size-3.5 text-amber-400" />
                <span className="flex items-center gap-1">
                  <Coins className="size-3.5 text-amber-400" />
                  {room?.stake ?? def.defaultStake}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 2-Player Versus Arena Layout */}
        <div className="my-8 grid grid-cols-1 md:grid-cols-7 items-center gap-4">
          {/* Player 1 Card (You) */}
          <div className="md:col-span-3 rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/30 via-slate-900/60 to-slate-950 p-5 text-center relative overflow-hidden">
            <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              <Wifi className="size-3" /> ONLINE
            </div>

            <div className="mx-auto size-20 rounded-2xl bg-indigo-500/20 border-2 border-indigo-500/40 flex items-center justify-center font-black text-indigo-200 text-2xl overflow-hidden shadow-lg shadow-indigo-500/20">
              {myPlayer?.avatarUrl ? (
                <img src={myPlayer.avatarUrl} alt="You" className="size-full object-cover" />
              ) : (
                myPlayer?.displayName?.[0] || (user?.user_metadata?.display_name as string)?.[0] || 'Y'
              )}
            </div>

            <h3 className="mt-3 text-base font-black text-white truncate">
              {myPlayer?.displayName || (user?.user_metadata?.display_name as string) || 'You'}
            </h3>
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">
              YOU (HOST)
            </span>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-center">
              {meReady ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3.5 py-1 text-xs font-black text-emerald-300 animate-pulse">
                  <CheckCircle2 className="size-3.5" /> READY
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-500/30 px-3.5 py-1 text-xs font-bold text-amber-300">
                  <Clock className="size-3.5" /> NOT READY
                </span>
              )}
            </div>
          </div>

          {/* VS Center Badge */}
          <div className="md:col-span-1 flex flex-col items-center justify-center py-2">
            <div className="size-12 rounded-full bg-gradient-to-br from-amber-500/20 via-slate-800 to-indigo-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black text-sm shadow-xl">
              VS
            </div>
            <span className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
              1v1 Match
            </span>
          </div>

          {/* Player 2 Card (Opponent) */}
          <div className="md:col-span-3 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/60 via-slate-900/80 to-slate-950 p-5 text-center relative overflow-hidden">
            {opponent ? (
              <>
                <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <Wifi className="size-3" /> ONLINE
                </div>

                <div className="mx-auto size-20 rounded-2xl bg-rose-500/20 border-2 border-rose-500/40 flex items-center justify-center font-black text-rose-200 text-2xl overflow-hidden shadow-lg shadow-rose-500/20">
                  {opponent.avatarUrl ? (
                    <img src={opponent.avatarUrl} alt="Opponent" className="size-full object-cover" />
                  ) : (
                    opponent.displayName?.[0] || 'O'
                  )}
                </div>

                <h3 className="mt-3 text-base font-black text-white truncate">
                  {opponent.displayName || 'Opponent'}
                </h3>
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                  OPPONENT
                </span>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-center">
                  {opponentReady ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3.5 py-1 text-xs font-black text-emerald-300">
                      <CheckCircle2 className="size-3.5" /> READY
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-500/30 px-3.5 py-1 text-xs font-bold text-amber-300">
                      <Clock className="size-3.5" /> WAITING FOR READY
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="py-6 flex flex-col items-center justify-center space-y-3">
                <div className="size-16 rounded-2xl bg-slate-800 border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-500 animate-pulse">
                  <Loader2 className="size-6 animate-spin" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-400">Waiting for Opponent…</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Share room code {room?.code} to invite
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Panel & Ready Button */}
        <div className="rounded-2xl bg-slate-950/80 border border-slate-800/80 p-5 text-center space-y-4">
          {countdown !== null && countdown > 0 ? (
            <div className="py-2">
              <div className="text-4xl sm:text-5xl font-black text-amber-400 animate-bounce font-mono">
                {countdown}
              </div>
              <p className="mt-2 text-xs font-black uppercase tracking-widest text-white">
                MATCH STARTING… PREPARE YOUR MOVE!
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-left text-xs text-slate-400 space-y-0.5">
                  <p className="font-bold text-white flex items-center gap-1.5">
                    <Shield className="size-3.5 text-emerald-400" /> Server-Timed Match
                  </p>
                  <p className="text-slate-500 text-[11px]">
                    Match clock begins strictly after both players ready up.
                  </p>
                </div>

                <button
                  onClick={() => void handleToggleReady()}
                  disabled={togglingReady || !opponent}
                  className={`w-full sm:w-auto min-w-[200px] py-3.5 px-8 rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-xl flex items-center justify-center gap-2 ${
                    meReady
                      ? 'bg-rose-600/90 hover:bg-rose-600 text-white shadow-rose-600/20 active:scale-[0.98]'
                      : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 shadow-emerald-500/25 active:scale-[0.98]'
                  } ${!opponent ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {togglingReady ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : meReady ? (
                    'CANCEL READY'
                  ) : (
                    'READY TO PLAY'
                  )}
                </button>
              </div>

              {!opponent && (
                <p className="text-[11px] font-semibold text-amber-400/90">
                  Waiting for another player to join before ready check can begin.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
