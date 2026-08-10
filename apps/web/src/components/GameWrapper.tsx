import React, { useEffect, useRef, useState } from 'react';
import type { GameId } from '../types';
import { ArrowLeft, Copy, Check, Eye, Timer, Volume2, VolumeX, X, Zap, Users, Globe, Lock } from 'lucide-react';
import { useMultiplayerStore } from '../store/multiplayerStore';

interface GameWrapperProps {
  title: string;
  gameId: GameId;
  mode: 'ai' | 'multiplayer';
  stake: number;
  onBack: () => void;
  children: React.ReactNode;
  isFullscreen?: boolean;
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
  isFullscreen = false
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const room = useMultiplayerStore((s) => s.room);
  const startRef = useRef<number>(Date.now());

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
      <div className="fixed inset-0 z-50 bg-[#060913] flex flex-col overflow-hidden">
        {/* Compact HUD bar — top */}
        {mode === 'multiplayer' && room && (
          <div className="z-[65] flex items-center justify-between px-4 py-2 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/60 flex-shrink-0">
            {/* Left: back + game title */}
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors border border-slate-700"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Lobby
              </button>
              <span className="text-sm font-black text-white">{title}</span>
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border ${
                isRanked
                  ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                  : 'bg-slate-700/60 text-slate-400 border-slate-600'
              }`}>
                {isRanked ? '⚡ Ranked' : 'Casual'}
              </span>
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                room.isPrivate
                  ? 'bg-slate-700/60 text-slate-400 border-slate-600'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
                {room.isPrivate ? <Lock className="w-2.5 h-2.5 inline mr-0.5" /> : <Globe className="w-2.5 h-2.5 inline mr-0.5" />}
                {room.isPrivate ? 'Private' : 'Public'}
              </span>
            </div>

            {/* Center: room info chips */}
            <div className="flex items-center gap-2">
              {/* Room code */}
              <button
                onClick={() => void copyCode()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-900/50 border border-slate-700 hover:border-indigo-500/50 transition-all group"
                title="Copy room code"
              >
                <span className="text-[9px] text-slate-500">Code</span>
                <span className="font-mono font-black text-indigo-300 text-[10px] tracking-widest">{room.code}</span>
                {copied
                  ? <Check className="w-3 h-3 text-emerald-400" />
                  : <Copy className="w-3 h-3 text-slate-500 group-hover:text-indigo-400" />
                }
              </button>
              {/* Timer */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
                <Timer className="w-3 h-3 text-amber-400" />
                <span className="font-mono font-black text-amber-300 text-[10px]">{formatElapsed(elapsed)}</span>
              </div>
              {/* Players */}
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
                <Users className="w-3 h-3 text-sky-400" />
                <span className="text-[10px] font-black text-sky-300">{room.players.length}/{room.maxPlayers}</span>
              </div>
              {/* Spectators */}
              {room.spectators.length > 0 && (
                <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
                  <Eye className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] font-black text-slate-300">{room.spectators.length}</span>
                </div>
              )}
              {/* Stake */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-900/30 border border-amber-700/30">
                <Zap className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-black text-amber-300">🪙 {stake} → {Math.round(stake * 1.8)}</span>
              </div>
            </div>

            {/* Right: sound + close */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-indigo-400" />}
              </button>
              <button
                onClick={onBack}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800/50 hover:bg-rose-500/80 hover:text-white text-slate-300 transition-all border border-slate-700/50"
                title="Quit Game"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Non-multiplayer: just close button */}
        {mode !== 'multiplayer' && (
          <button
            onClick={onBack}
            className="absolute top-6 right-6 z-[60] flex items-center justify-center w-12 h-12 rounded-full bg-slate-800/50 hover:bg-rose-500/80 hover:text-white text-slate-300 transition-all border border-slate-700/50 shadow-2xl backdrop-blur-md group"
            title="Quit Game"
          >
            <X className="w-6 h-6 group-hover:scale-110 transition-transform" />
          </button>
        )}

        {/* Game content */}
        <div className="w-full flex-1 min-h-0 flex items-start justify-center relative p-2 sm:p-4 overflow-hidden">
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
          {/* Multiplayer chips */}
          {mode === 'multiplayer' && room && (
            <>
              <button
                onClick={() => void copyCode()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 hover:border-indigo-500/50 transition-colors text-xs"
                title="Copy room code"
              >
                <span className="text-slate-500 text-[9px]">Code</span>
                <span className="font-mono font-black text-indigo-300 tracking-widest">{room.code}</span>
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-500" />}
              </button>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                <Timer className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-mono font-black text-amber-300">{formatElapsed(elapsed)}</span>
              </div>
              {room.spectators.length > 0 && (
                <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-black text-slate-300">{room.spectators.length}</span>
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold">
            <span className="text-slate-400">Prize:</span>
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
