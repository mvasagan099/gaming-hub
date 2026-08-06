import React, { useState } from "react";
import { GameWrapper } from "../../components/GameWrapper";
import { FruitNinjaPhaserGame } from "./FruitNinjaPhaserGame";
import { useMultiplayerStore } from "../../store/multiplayerStore";
import { MultiplayerMatchPanel } from "../shared/components/MultiplayerMatchPanel";
import { Trophy, RefreshCcw, Shield, Zap } from "lucide-react";

interface FruitNinjaProps {
  mode: "ai" | "multiplayer";
  stake: number;
  onBack: () => void;
}

export const FruitNinjaGame: React.FC<FruitNinjaProps> = ({ mode: initialMode, stake, onBack }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playMode, setPlayMode] = useState<"classic" | "zen">("classic");
  const isMultiplayer = initialMode === "multiplayer";
  const room = useMultiplayerStore((s) => s.room);

  const startGame = () => setIsPlaying(true);
  const resetGame = () => setIsPlaying(false);

  if (isPlaying) {
    return (
      <GameWrapper title="Fruit Ninja Blade" gameId="fruit-ninja" mode={initialMode} stake={stake} onBack={resetGame} isFullscreen>
        <div className="flex flex-col lg:flex-row items-center justify-center gap-6 w-full max-w-5xl">
          <div className="flex flex-col items-center gap-4">
            <FruitNinjaPhaserGame mode={playMode} />
            {!isMultiplayer && (
              <button
                onClick={resetGame}
                className="px-6 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 rounded-xl font-bold text-rose-400 text-xs tracking-wider uppercase flex items-center gap-2 shadow-lg transition-all"
              >
                <RefreshCcw className="w-4 h-4" /> Reset Match
              </button>
            )}
          </div>
          {isMultiplayer && (
            <div className="hidden lg:block flex-shrink-0">
              <MultiplayerMatchPanel compact />
            </div>
          )}
        </div>
      </GameWrapper>
    );
  }

  return (
    <GameWrapper title="Fruit Ninja Blade" gameId="fruit-ninja" mode={initialMode} stake={stake} onBack={onBack}>
      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-5xl mx-auto items-start justify-center">
        <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto p-5 glass-panel rounded-3xl border border-slate-800 shadow-2xl">
          {/* Crown header */}
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/40 mb-2 animate-bounce">
            <Trophy className="w-6 h-6 text-amber-400" />
          </div>

          <h2 className="text-xl font-black text-white tracking-wide text-center">FRUIT NINJA BLADE</h2>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest text-center mt-0.5">Vite + Phaser 3 Arcade Engine</p>

          {/* Play Mode Selection */}
          <div className="w-full mt-4">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 text-left">Blade Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPlayMode("classic")}
                className={`py-3 rounded-xl font-black text-xs border transition-all flex flex-col items-center gap-1.5 ${
                  playMode === "classic"
                    ? "bg-amber-500/20 border-amber-500 text-amber-400 shadow-lg shadow-amber-500/10"
                    : "bg-slate-850 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <Zap className="w-4 h-4" />
                <div className="text-center">
                  <p className="font-black">Classic Mode</p>
                  <p className="text-[9px] text-slate-400 font-medium">3 Lives &amp; Bombs</p>
                </div>
              </button>
              <button
                onClick={() => setPlayMode("zen")}
                className={`py-3 rounded-xl font-black text-xs border transition-all flex flex-col items-center gap-1.5 ${
                  playMode === "zen"
                    ? "bg-amber-500/20 border-amber-500 text-amber-400 shadow-lg shadow-amber-500/10"
                    : "bg-slate-850 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <Shield className="w-4 h-4" />
                <div className="text-center">
                  <p className="font-black">Zen Mode</p>
                  <p className="text-[9px] text-slate-400 font-medium">No Bombs, Just Slices</p>
                </div>
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

        {isMultiplayer && room && (
          <div className="hidden lg:block flex-shrink-0">
            <MultiplayerMatchPanel />
          </div>
        )}
      </div>
    </GameWrapper>
  );
};

export default FruitNinjaGame;
