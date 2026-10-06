import React, { useState } from "react";
import { GameWrapper } from "../../components/GameWrapper";
import { FruitNinjaPhaserGame } from "./FruitNinjaPhaserGame";
import { useMultiplayerStore } from "../../store/multiplayerStore";
import { MultiplayerMatchPanel } from "../shared/components/MultiplayerMatchPanel";
import { Trophy, RefreshCcw, Shield, Zap, Sparkles, Flame, Coins } from "lucide-react";

interface FruitNinjaProps {
  mode: "ai" | "multiplayer";
  stake: number;
  onBack: () => void;
}

export const FruitNinjaGame: React.FC<FruitNinjaProps> = ({ mode: initialMode, stake, onBack }) => {
  const isMultiplayer = initialMode === "multiplayer";
  const [isPlaying, setIsPlaying] = useState(isMultiplayer);
  const [playMode, setPlayMode] = useState<"classic" | "zen">("classic");
  const room = useMultiplayerStore((s) => s.room);

  const activePlayMode = isMultiplayer ? "classic" : playMode;

  const startGame = () => setIsPlaying(true);
  const resetGame = () => setIsPlaying(false);

  const handleReplay = () => {
    if (isMultiplayer) {
      void useMultiplayerStore.getState().rematch();
      return;
    }
    resetGame();
    setTimeout(startGame, 60);
  };

  const isGameStarted = isMultiplayer || isPlaying;

  if (isGameStarted) {
    return (
      <GameWrapper title="Fruit Ninja Blade" gameId="fruit-ninja" mode={initialMode} stake={stake} onBack={onBack} isFullscreen>
        <div className="flex flex-col lg:flex-row items-center justify-center gap-3 lg:gap-6 w-full h-full p-1 sm:p-2 lg:p-4 relative select-none overflow-hidden">
          <div className={`flex flex-col items-center justify-center gap-0 lg:gap-4 w-full h-full overflow-hidden ${isMultiplayer ? "lg:flex-1 lg:min-w-0 lg:min-h-0" : ""}`}>
            <FruitNinjaPhaserGame
              mode={activePlayMode}
              isMultiplayer={isMultiplayer}
              onBack={onBack}
              onReplay={handleReplay}
            />
            {!isMultiplayer && (
              <button
                onClick={resetGame}
                className="hidden lg:flex px-6 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 rounded-xl font-black text-rose-400 text-xs tracking-wider uppercase items-center gap-2 shadow-lg transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <RefreshCcw className="w-4 h-4" /> Reset Match
              </button>
            )}
          </div>
          {isMultiplayer && (
            <div className="hidden lg:flex flex-col flex-shrink-0 w-full max-w-[320px] xl:max-w-[340px] h-full max-h-[calc(100dvh-4.25rem)] justify-center py-1">
              <div className="overflow-y-auto max-h-full pr-1.5 custom-scrollbar">
                <MultiplayerMatchPanel compact />
              </div>
            </div>
          )}
        </div>
      </GameWrapper>
    );
  }

  return (
    <GameWrapper title="Fruit Ninja Blade" gameId="fruit-ninja" mode={initialMode} stake={stake} onBack={onBack} isGameOver={true}>
      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-4xl mx-auto items-center justify-center my-4">
        <div className="relative flex flex-col items-center justify-center w-full max-w-md mx-auto p-7 glass-panel rounded-3xl border border-amber-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.8)] bg-white/95 dark:bg-gradient-to-b dark:from-slate-900/90 dark:via-slate-950 dark:to-slate-950">
          {/* Header Crown */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-amber-400/10 dark:from-amber-500/30 dark:to-amber-400/10 flex items-center justify-center border border-amber-500/50 mb-3 shadow-[0_0_20px_rgba(245,158,11,0.25)] animate-bounce">
            <Flame className="w-7 h-7 text-amber-500 dark:text-amber-400" />
          </div>

          <div className="flex items-center gap-1.5 mb-0.5">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-wide text-center uppercase">FRUIT NINJA 3D</h2>
            <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400 animate-pulse" />
          </div>
          <p className="text-[11px] text-amber-600 dark:text-amber-400/80 font-bold uppercase tracking-widest text-center">Arcade Blade Arena</p>

          {/* Play Mode Selection */}
          {!isMultiplayer ? (
            <div className="w-full mt-5">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5 text-left">Blade Mode</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPlayMode("classic")}
                  className={`py-3.5 px-3 rounded-2xl font-black text-xs border transition-all flex flex-col items-center gap-1.5 ${
                    playMode === "classic"
                      ? "bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)] scale-[1.02]"
                      : "bg-slate-100 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <Zap className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                  <div className="text-center">
                    <p className="font-black text-xs text-slate-900 dark:text-white">Classic Mode</p>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">3 Lives &amp; Bombs</p>
                  </div>
                </button>
                <button
                  onClick={() => setPlayMode("zen")}
                  className={`py-3.5 px-3 rounded-2xl font-black text-xs border transition-all flex flex-col items-center gap-1.5 ${
                    playMode === "zen"
                      ? "bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)] scale-[1.02]"
                      : "bg-slate-100 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <Shield className="w-5 h-5 text-sky-500 dark:text-sky-400" />
                  <div className="text-center">
                    <p className="font-black text-xs text-slate-900 dark:text-white">Zen Mode</p>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">Pure Slicing Peace</p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full mt-5 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center gap-3 text-amber-600 dark:text-amber-400">
              <Zap className="w-5 h-5" />
              <div className="text-center">
                <p className="font-black text-xs uppercase tracking-wider">Multiplayer Mode: Classic</p>
                <p className="text-[10px] text-amber-600/80 dark:text-amber-300/80 font-medium">3 Lives &amp; Bombs Enabled</p>
              </div>
            </div>
          )}

          {/* Stake and play button */}
          <div className="w-full mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Entry Fee</span>
              <span className="text-base font-black text-amber-500 dark:text-amber-400 flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-400 shrink-0" /> {stake} <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Coins</span>
              </span>
            </div>

            <button
              onClick={startGame}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-xl shadow-amber-500/30 transform hover:scale-[1.02] active:scale-[0.98] transition-all tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
            >
              <Trophy className="w-4 h-4" /> Start Slicing
            </button>
          </div>
        </div>

        {isMultiplayer && room && (
          <div className="hidden lg:block flex-shrink-0 w-80">
            <MultiplayerMatchPanel />
          </div>
        )}
      </div>
    </GameWrapper>
  );
};

export default FruitNinjaGame;
