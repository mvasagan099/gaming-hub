import React, { useState } from "react";
import { GameWrapper } from "../../components/GameWrapper";
import { ChessPhaserGame } from "./ChessPhaserGame";
import { Trophy, RefreshCcw, Shield, Cpu, Zap } from "lucide-react";

interface ChessGameProps {
  mode: "ai" | "multiplayer";
  stake: number;
  onBack: () => void;
}

export const ChessGame: React.FC<ChessGameProps> = ({ mode: initialMode, stake, onBack }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playMode, setPlayMode] = useState<"ai" | "pvp">("ai");
  const [aiLevel, setAiLevel] = useState<number>(2); // 1, 2, 3
  const [theme, setTheme] = useState<"classic" | "wood" | "cyber">("classic");

  const startGame = () => {
    setIsPlaying(true);
  };

  const resetGame = () => {
    setIsPlaying(false);
  };

  if (isPlaying) {
    return (
      <GameWrapper title="Chess Master" gameId="chess" mode={initialMode} stake={stake} onBack={resetGame} isFullscreen>
        <div className="relative flex flex-col items-center justify-center w-full max-w-5xl mx-auto my-4">
          <ChessPhaserGame mode={playMode} level={aiLevel} theme={theme} onBack={onBack} onReplay={resetGame} />
          
          <button
            onClick={resetGame}
            className="mt-4 px-6 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 rounded-xl font-bold text-rose-400 text-xs tracking-wider uppercase flex items-center gap-2 shadow-lg transition-all"
          >
            <RefreshCcw className="w-4 h-4" /> Reset Match
          </button>
        </div>
      </GameWrapper>
    );
  }

  return (
    <GameWrapper title="Chess Master" gameId="chess" mode={initialMode} stake={stake} onBack={onBack}>
      <div className="flex flex-row items-center justify-center w-full max-w-3xl mx-auto gap-4">
        {/* Main Panel */}
        <div className="flex flex-col items-center justify-center w-full max-w-sm p-4 max-h-[90vh] overflow-y-auto glass-panel rounded-3xl border border-slate-800 shadow-2xl scrollbar-hide">
        {/* Crown header */}
        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/40 mb-1 animate-bounce">
          <Trophy className="w-5 h-5 text-amber-400" />
        </div>

        <h2 className="text-lg font-black text-white tracking-wide text-center">CHESS MASTER</h2>
        <p className="text-[10px] text-slate-400 uppercase tracking-widest text-center mt-0.5">Vite + Phaser 3 + chess.js</p>

        {/* Play Mode Selection */}
        <div className="w-full mt-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 text-left">Opponent Type</label>
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
              <span>Vs computer</span>
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
              <span>Pass & Play</span>
            </button>
          </div>
        </div>

        {/* AI Level Selection (Only visible if AI mode is selected) */}
        {playMode === "ai" && (
          <div className="w-full mt-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 text-left">AI Level</label>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setAiLevel(lvl)}
                  className={`py-2 rounded-xl font-black text-xs border transition-all flex flex-col items-center gap-1 ${
                    aiLevel === lvl
                      ? "bg-amber-500/20 border-amber-500 text-amber-400 shadow-lg shadow-amber-500/10"
                      : "bg-slate-850 border-slate-700 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{lvl === 1 ? "Easy" : lvl === 2 ? "Medium" : "Hard"}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stake and play button */}
        <div className="w-full mt-3 pt-2 border-t border-slate-800">
          <div className="flex justify-between items-center mb-3">
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

      {/* Side Panel for Theme */}
      <div className="flex flex-col items-center w-[180px] p-4 glass-panel rounded-3xl border border-slate-800 shadow-2xl">
        <div className="w-full">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-3 text-center">Board Theme</label>
          <div className="flex flex-col gap-3">
            {(["classic", "wood", "cyber"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`py-3 rounded-xl font-black text-[10px] border transition-all flex flex-col items-center gap-1 uppercase tracking-wider ${
                  theme === t
                    ? "bg-amber-500/20 border-amber-500 text-amber-400 shadow-lg shadow-amber-500/10"
                    : "bg-slate-850 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <span>{t}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      </div>
    </GameWrapper>
  );
};

export default ChessGame;
