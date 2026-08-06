import React, { useState } from "react";
import { GameWrapper } from "../../components/GameWrapper";
import { LudoPhaserGame } from "./LudoPhaserGame";
import { useMultiplayerStore } from "../../store/multiplayerStore";
import { MultiplayerMatchPanel } from "../shared/components/MultiplayerMatchPanel";
import { Trophy, Users, Shield, Cpu, RefreshCcw } from "lucide-react";

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

  const [isPlaying, setIsPlaying] = useState(isMultiplayer);
  const [playerCount, setPlayerCount] = useState<2 | 4>(4);
  const [playMode, setPlayMode] = useState<"ai" | "pvp">(isMultiplayer ? "pvp" : "ai");

  const participants = room?.players ?? [];
  const onlinePlayers = isMultiplayer && participants.length > 0 ? participants.length : playerCount;
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
        <div className="relative flex flex-col lg:flex-row items-center justify-center gap-6 w-full max-w-6xl mx-auto">
          <div className="flex flex-col items-center gap-4">
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
                className="px-6 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 rounded-xl font-bold text-rose-400 text-xs tracking-wider uppercase flex items-center gap-2 shadow-lg transition-all"
              >
                <RefreshCcw className="w-4 h-4" /> Reset Match
              </button>
            )}
          </div>
          {/* Multiplayer Panel */}
          {isMultiplayer && (
            <div className="hidden lg:block">
              <MultiplayerMatchPanel compact />
            </div>
          )}
        </div>
      </GameWrapper>
    );
  }

  return (
    <GameWrapper title="Ludo Champion" gameId="ludo" mode={initialMode} stake={stake} onBack={onBack}>
      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-5xl mx-auto items-start justify-center">
        {/* Setup Card */}
        <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto p-5 glass-panel rounded-3xl border border-slate-800 shadow-2xl">
          {/* Crown header */}
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/40 mb-2 animate-bounce">
            <Trophy className="w-6 h-6 text-amber-400" />
          </div>

          <h2 className="text-xl font-black text-white tracking-wide text-center">LUDO CHAMPION</h2>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest text-center mt-0.5">Vite + Phaser 3 Engine</p>

          {/* 2 vs 4 Players Selection */}
          <div className="w-full mt-4">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 text-left">Players</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPlayerCount(2)}
                className={`py-2 rounded-xl font-black text-xs border transition-all flex flex-col items-center gap-1 ${
                  playerCount === 2
                    ? "bg-amber-500/20 border-amber-500 text-amber-400 shadow-lg shadow-amber-500/10"
                    : "bg-slate-850 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>2 Players</span>
              </button>
              <button
                onClick={() => setPlayerCount(4)}
                className={`py-2 rounded-xl font-black text-xs border transition-all flex flex-col items-center gap-1 ${
                  playerCount === 4
                    ? "bg-amber-500/20 border-amber-500 text-amber-400 shadow-lg shadow-amber-500/10"
                    : "bg-slate-850 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>4 Players</span>
              </button>
            </div>
          </div>

          {/* Opponent Selection */}
          <div className="w-full mt-3">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 text-left">Game Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPlayMode("ai")}
                className={`py-2 rounded-xl font-black text-xs border transition-all flex flex-col items-center gap-1 ${
                  playMode === "ai"
                    ? "bg-amber-500/20 border-amber-500 text-amber-400 shadow-lg shadow-amber-500/10"
                    : "bg-slate-850 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Player vs AI</span>
              </button>
              <button
                onClick={() => setPlayMode("pvp")}
                className={`py-2 rounded-xl font-black text-xs border transition-all flex flex-col items-center gap-1 ${
                  playMode === "pvp"
                    ? "bg-amber-500/20 border-amber-500 text-amber-400 shadow-lg shadow-amber-500/10"
                    : "bg-slate-850 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Pass &amp; Play</span>
              </button>
            </div>
          </div>

          {/* Stake and play button */}
          <div className="w-full mt-4 pt-3 border-t border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Entry Fee</span>
              <span className="text-base font-black text-amber-400">🪙 {stake} Coins</span>
            </div>

            <button
              onClick={startGame}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-xs rounded-xl shadow-xl shadow-amber-500/25 transform hover:scale-[1.02] active:scale-[0.98] transition-all tracking-wider uppercase"
            >
              Start Match
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
