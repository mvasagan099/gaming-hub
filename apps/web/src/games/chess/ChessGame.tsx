import React, { useState } from "react";
import { GameWrapper } from "../../components/GameWrapper";
import { ChessPhaserGame } from "./ChessPhaserGame";
import { useMultiplayerStore } from "../../store/multiplayerStore";
import { Trophy, RefreshCcw, Shield, Cpu, Zap, Sparkles } from "lucide-react";

interface ChessGameProps {
  mode: "ai" | "multiplayer";
  stake: number;
  onBack: () => void;
}

export const ChessGame: React.FC<ChessGameProps> = ({ mode: initialMode, stake, onBack }) => {
  const isMultiplayer = initialMode === "multiplayer";
  const room = useMultiplayerStore((s) => s.room);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const isSpectator = useMultiplayerStore((s) => s.isSpectator);

  const [isPlaying, setIsPlaying] = useState(isMultiplayer);
  const [playMode, setPlayMode] = useState<"ai" | "pvp">(isMultiplayer ? "pvp" : "ai");
  const [aiLevel, setAiLevel] = useState<number>(2); // 1, 2, 3
  const [theme, setTheme] = useState<"classic" | "wood" | "cyber">("classic");

  const participants = room?.players ?? [];
  const seat = isMultiplayer ? (isSpectator ? null : mySeat) : null;
  const names = isMultiplayer
    ? [...participants]
        .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
        .map((p) => p.displayName)
    : [];

  const startGame = () => {
    setIsPlaying(true);
  };

  const resetGame = () => {
    setIsPlaying(false);
  };

  const handleReplay = () => {
    if (isMultiplayer) {
      void useMultiplayerStore.getState().rematch();
    } else {
      resetGame();
    }
  };

  if (isPlaying) {
    return (
      <GameWrapper title="Chess Master" gameId="chess" mode={initialMode} stake={stake} onBack={isMultiplayer ? onBack : resetGame} isFullscreen>
        <div className="relative flex flex-col items-center justify-center w-full max-w-6xl mx-auto my-3">
          <ChessPhaserGame
            mode={playMode}
            level={aiLevel}
            theme={theme}
            online={isMultiplayer}
            players={participants.length || 2}
            seat={seat}
            names={names}
            onBack={onBack}
            onReplay={handleReplay}
          />
          
          {!isMultiplayer && (
            <button
              onClick={handleReplay}
              className="mt-3 px-6 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 rounded-xl font-bold text-rose-400 text-xs tracking-wider uppercase flex items-center gap-2 shadow-lg transition-all hover:scale-105 active:scale-95"
            >
              <RefreshCcw className="w-4 h-4" /> Reset Match
            </button>
          )}
        </div>
      </GameWrapper>
    );
  }

  return (
    <GameWrapper title="Chess Master" gameId="chess" mode={initialMode} stake={stake} onBack={onBack} isGameOver={true}>
      <div className="flex flex-col md:flex-row items-center justify-center w-full max-w-3xl mx-auto gap-5">
        {/* Main Panel */}
        <div className="relative flex flex-col items-center justify-center w-full max-w-sm p-6 glass-panel rounded-3xl border border-amber-500/30 shadow-[0_15px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_15px_40px_rgba(0,0,0,0.6)] bg-white/95 dark:bg-gradient-to-b dark:from-slate-900/90 dark:via-slate-950/95 dark:to-slate-950">
          {/* Crown header */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-amber-400/10 dark:from-amber-500/30 dark:to-amber-400/10 flex items-center justify-center border border-amber-500/50 mb-3 shadow-[0_0_20px_rgba(245,158,11,0.25)]">
            <Trophy className="w-7 h-7 text-amber-500 dark:text-amber-400" />
          </div>

          <div className="flex items-center gap-1.5 mb-0.5">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-wide text-center">CHESS MASTER</h2>
            <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400 animate-pulse" />
          </div>
          <p className="text-[11px] text-amber-600 dark:text-amber-400/80 font-bold uppercase tracking-widest text-center">3D Staunton Edition</p>

          {/* Play Mode Selection */}
          <div className="w-full mt-5">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5 text-left">Opponent Type</label>
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
                <span>Vs Computer</span>
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

          {/* AI Level Selection */}
          {playMode === "ai" && (
            <div className="w-full mt-3.5">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5 text-left">Difficulty Level</label>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setAiLevel(lvl)}
                    className={`py-2 rounded-xl font-black text-xs border transition-all flex flex-col items-center gap-1 ${
                      aiLevel === lvl
                        ? "bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                        : "bg-slate-100 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>{lvl === 1 ? "Easy" : lvl === 2 ? "Medium" : "Hard"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Board Theme Selection */}
          <div className="w-full mt-3.5">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5 text-left">Board Theme</label>
            <div className="grid grid-cols-3 gap-2">
              {(["classic", "wood", "cyber"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`py-2 rounded-xl font-black text-xs border transition-all flex flex-col items-center gap-1 uppercase tracking-wider ${
                    theme === t
                      ? "bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                      : "bg-slate-100 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <span>{t}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Stake and play button */}
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
      </div>
    </GameWrapper>
  );
};

export default ChessGame;
