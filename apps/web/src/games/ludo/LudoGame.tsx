import React, { useState } from "react";
import { GameWrapper } from "../../components/GameWrapper";
import { LudoPhaserGame } from "./LudoPhaserGame";
import { useMultiplayerStore } from "../../store/multiplayerStore";
import { MultiplayerMatchPanel } from "../shared/components/MultiplayerMatchPanel";
import { Trophy, Users, Shield, Cpu, RefreshCcw, Sparkles, Swords, MessageSquare, X } from "lucide-react";

interface LudoGameProps {
  mode: "ai" | "multiplayer";
  stake: number;
  onBack: () => void;
}

export const LudoGame: React.FC<LudoGameProps> = ({ mode: initialMode, stake, onBack }) => {
  const isMultiplayer = initialMode === "multiplayer";
  const room = useMultiplayerStore((s) => s.room);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const isSpectator = useMultiplayerStore((s) => s.isSpectator);
  const [showMobilePanel, setShowMobilePanel] = useState(false);

  const [isPlaying, setIsPlaying] = useState(isMultiplayer);
  const [playMode, setPlayMode] = useState<"ai" | "pvp">(isMultiplayer ? "pvp" : "ai");

  const participants = room?.players ?? [];
  const maxPlayers = room?.maxPlayers ?? 2;
  const onlinePlayers = isMultiplayer && maxPlayers > 0 ? maxPlayers : 2;
  const seat = isMultiplayer ? (isSpectator ? null : mySeat) : null;
  const names = isMultiplayer
    ? [...participants]
        .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
        .map((p) => p.displayName)
    : [];

  const startGame = () => setIsPlaying(true);
  const resetGame = () => setIsPlaying(false);

  const handleReplay = () => {
    if (isMultiplayer) {
      void useMultiplayerStore.getState().rematch();
    } else {
      resetGame();
    }
  };

  if (isPlaying) {
    return (
      <GameWrapper title="Ludo Champion" gameId="ludo" mode={initialMode} stake={stake} onBack={isMultiplayer ? onBack : resetGame} isFullscreen>
        <div className="relative flex flex-col lg:flex-row items-center justify-center gap-4 w-full h-full p-0 sm:p-2">
          <div className="flex flex-col items-center gap-4 w-full h-full justify-center overflow-hidden">
            <LudoPhaserGame
              mode={playMode}
              players={onlinePlayers}
              online={isMultiplayer}
              seat={seat}
              names={names}
            />
            {!isMultiplayer && (
              <button
                onClick={handleReplay}
                className="px-6 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 rounded-xl font-bold text-rose-400 text-xs tracking-wider uppercase flex items-center gap-2 shadow-lg transition-all hover:scale-105 active:scale-95"
              >
                <RefreshCcw className="w-4 h-4" /> Reset Match
              </button>
            )}
          </div>

          {/* Desktop Multiplayer Sidebar */}
          {isMultiplayer && (
            <div className="hidden lg:block flex-shrink-0">
              <MultiplayerMatchPanel compact />
            </div>
          )}

          {/* Mobile Multiplayer Floating Toggle Button */}
          {isMultiplayer && room && (
            <button
              onClick={() => setShowMobilePanel(true)}
              className="lg:hidden fixed bottom-5 left-4 z-[70] flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/95 text-white font-bold text-xs border border-indigo-500/50 shadow-2xl backdrop-blur-md hover:bg-indigo-950 transition-all cursor-pointer group active:scale-95"
              aria-label="Open Match Details & Chat"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <Swords size={14} className="text-amber-400" />
              <span>Match Details</span>
              <MessageSquare size={13} className="text-indigo-300 ml-0.5" />
            </button>
          )}

          {/* Mobile Multiplayer Modal - Centered */}
          {isMultiplayer && room && showMobilePanel && (
            <div className="lg:hidden fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
              <div
                className="fixed inset-0"
                onClick={() => setShowMobilePanel(false)}
                aria-hidden="true"
              />
              <div className="relative z-10 bg-slate-900/98 border border-slate-700/80 rounded-3xl p-4 max-h-[88vh] w-full max-w-sm overflow-y-auto flex flex-col gap-3 shadow-[0_20px_50px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                      <Users size={15} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white leading-tight">Multiplayer Match Panel</h3>
                      <p className="text-[10px] text-slate-400">Room: <span className="font-mono font-bold text-indigo-300">{room.code}</span></p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowMobilePanel(false)}
                    className="p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    aria-label="Close panel"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="py-1 flex justify-center">
                  <MultiplayerMatchPanel compact={false} showControls={true} showChat={true} />
                </div>
              </div>
            </div>
          )}
        </div>
      </GameWrapper>
    );
  }

  return (
    <GameWrapper title="Ludo Champion" gameId="ludo" mode={initialMode} stake={stake} onBack={onBack} isGameOver={true}>
      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-5xl mx-auto items-start justify-center">
        {/* Setup Card */}
        <div className="relative flex flex-col items-center justify-center w-full max-w-sm mx-auto p-6 glass-panel rounded-3xl border border-amber-500/30 shadow-[0_15px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_15px_40px_rgba(0,0,0,0.6)] bg-white/95 dark:bg-gradient-to-b dark:from-slate-900/90 dark:via-slate-950/95 dark:to-slate-950">
          {/* Glowing Header Badge */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-amber-400/10 dark:from-amber-500/30 dark:to-amber-400/10 flex items-center justify-center border border-amber-500/50 mb-3 shadow-[0_0_20px_rgba(245,158,11,0.25)]">
            <Trophy className="w-7 h-7 text-amber-500 dark:text-amber-400" />
          </div>

          <div className="flex items-center gap-1.5 mb-0.5">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-wide text-center">LUDO CHAMPION</h2>
            <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400 animate-pulse" />
          </div>
          <p className="text-[11px] text-amber-600 dark:text-amber-400/80 font-bold uppercase tracking-widest text-center">3D Premium Edition</p>

          {/* Players Badge */}
          <div className="w-full mt-5">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5 text-left">Players</label>
            <div className="w-full py-2.5 px-4 bg-amber-500/10 border border-amber-500/30 rounded-xl font-bold text-xs text-amber-600 dark:text-amber-400 flex items-center justify-center gap-2 shadow-inner">
              <Users className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <span>2 Players Match</span>
            </div>
          </div>

          {/* Opponent Selection */}
          <div className="w-full mt-3.5">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5 text-left">Game Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPlayMode("ai")}
                className={`py-3 rounded-xl font-black text-xs border transition-all flex flex-col items-center gap-1.5 ${
                  playMode === "ai"
                    ? "bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                    : "bg-slate-100 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Cpu className="w-4 h-4" />
                <span>Player vs AI</span>
              </button>
              <button
                onClick={() => setPlayMode("pvp")}
                className={`py-3 rounded-xl font-black text-xs border transition-all flex flex-col items-center gap-1.5 ${
                  playMode === "pvp"
                    ? "bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                    : "bg-slate-100 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>Pass &amp; Play</span>
              </button>
            </div>
          </div>

          {/* Stake and Play Button */}
          <div className="w-full mt-5 pt-4 border-t border-slate-200 dark:border-slate-800/80">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Entry Fee</span>
              <span className="text-base font-black text-amber-500 dark:text-amber-400 flex items-center gap-1">
                🪙 {stake} <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Coins</span>
              </span>
            </div>

            <button
              onClick={startGame}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm rounded-xl shadow-[0_0_25px_rgba(245,158,11,0.4)] transform hover:scale-[1.02] active:scale-[0.98] transition-all tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
            >
              <Trophy className="w-4 h-4" /> Start Match
            </button>
          </div>
        </div>

        {/* Multiplayer Panel in lobby */}
        {isMultiplayer && room && (
          <div className="hidden lg:block flex-shrink-0">
            <MultiplayerMatchPanel />
          </div>
        )}
      </div>
    </GameWrapper>
  );
};

export default LudoGame;
