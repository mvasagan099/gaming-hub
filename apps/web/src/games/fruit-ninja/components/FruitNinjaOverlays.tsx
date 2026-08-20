import React, { useEffect, useState } from "react";
import Phaser from "phaser";
import { FruitEvents } from "../phaser/events/FruitEvents";
import { Trophy, Shield, XCircle, RotateCcw, Sparkles, Flame, Zap, Award, LogOut } from "lucide-react";
import { claimPracticeReward } from "../../../services/api/practiceReward";
import { useMultiplayerStore, type WinnerInfo } from "../../../store/multiplayerStore";
import type { FruitStats } from "../phaser/types/fruit.types";

interface FruitNinjaOverlaysProps {
  game: Phaser.Game | null;
  isMultiplayer?: boolean;
  onReplay: () => void;
  onClose: () => void;
}

export const FruitNinjaOverlays: React.FC<FruitNinjaOverlaysProps> = ({
  game,
  isMultiplayer = false,
  onReplay,
  onClose,
}) => {
  const [gameOverData, setGameOverData] = useState<{
    stats: FruitStats;
    title: string;
    subtitle: string;
    isWin: boolean;
    isDraw: boolean;
  } | null>(null);

  const [hasRewarded, setHasRewarded] = useState(false);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const winner = useMultiplayerStore((s) => s.winner);
  const requestRematch = useMultiplayerStore((s) => s.requestRematch);
  const leaveRoom = useMultiplayerStore((s) => s.leaveRoom);

  useEffect(() => {
    if (!game) return;

    const timer = setInterval(() => {
      const scene = game.scene.getScene("FruitNinjaScene");
      if (scene) {
        clearInterval(timer);

        scene.events.on(FruitEvents.GAME_OVER, (payload: { stats: FruitStats; winner?: WinnerInfo | null; endReason?: string }) => {
          const stats = payload?.stats || { score: 0, combosCount: 0, slicedCount: 0, bombsHit: 0, missedCount: 0 };
          let title = "GAME OVER";
          let subtitle = "MATCH COMPLETE";
          let isWin = false;
          let isDraw = false;

          if (isMultiplayer) {
            const activeWinner = payload?.winner ?? useMultiplayerStore.getState().winner;
            const winnerSeats = activeWinner?.winnerSeats ?? [];
            const endReason = payload?.endReason;

            isWin = mySeat !== null && winnerSeats.includes(mySeat);
            isDraw = winnerSeats.length > 1;

            if (winnerSeats.length === 0) {
              title = "MATCH ENDED";
              subtitle = "Calculating winner...";
            } else if (isWin) {
              title = "VICTORY!";
              subtitle = endReason === "bomb_elimination"
                ? "Opponent Hit A Bomb!"
                : endReason === "player_eliminated"
                  ? "Opponent Ran Out Of Lives!"
                  : "Highest Score Wins!";
            } else if (isDraw) {
              title = "MATCH DRAW";
              subtitle = "Equal Scores!";
            } else {
              title = "DEFEAT";
              subtitle = endReason === "bomb_elimination"
                ? "Bomb Exploded!"
                : "Out of Lives!";
            }
          } else {
            isWin = stats.score > 0;
            title = stats.bombsHit > 0 ? "BOMB HIT!" : "TIME'S UP!";
            subtitle = stats.score > 100 ? "Incredible Slicing!" : "Great Effort!";
            
            if (stats.score > 0 && !hasRewarded) {
              setHasRewarded(true);
              void claimPracticeReward("fruit-ninja");
            }
          }

          setGameOverData({ stats, title, subtitle, isWin, isDraw });
        });
      }
    }, 100);

    return () => clearInterval(timer);
  }, [game, isMultiplayer, mySeat, hasRewarded]);

  const handlePlayAgain = () => {
    setGameOverData(null);
    if (isMultiplayer) {
      void requestRematch();
    } else {
      onReplay();
    }
  };

  const handleExit = () => {
    setGameOverData(null);
    if (isMultiplayer) {
      void leaveRoom();
    }
    onClose();
  };

  if (!gameOverData) return null;

  const { stats, title, subtitle, isWin, isDraw } = gameOverData;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300 select-none">
      {/* Ambient background glow behind modal */}
      <div className={`pointer-events-none absolute w-96 h-96 rounded-full blur-3xl opacity-40 ${
        isWin ? "bg-amber-500" : isDraw ? "bg-sky-500" : "bg-rose-600"
      }`} />

      {/* Main Glassmorphic Modal */}
      <div className={`
        relative flex flex-col items-center w-full max-w-sm p-6 sm:p-7
        bg-slate-900/95 backdrop-blur-2xl
        border-2 rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.9)]
        transform animate-in zoom-in-95 duration-200
        ${isWin ? "border-amber-500/60 shadow-amber-500/20" : isDraw ? "border-sky-500/60 shadow-sky-500/20" : "border-rose-500/60 shadow-rose-500/20"}
      `}>
        {/* Top Header Floating Badge */}
        <div className={`
          w-16 h-16 rounded-2xl flex items-center justify-center border-2 mb-3 shadow-lg transform -translate-y-2
          ${isWin
            ? "bg-gradient-to-tr from-amber-500/30 to-amber-400/10 border-amber-500/70 shadow-amber-500/30 animate-bounce"
            : isDraw
              ? "bg-gradient-to-tr from-sky-500/30 to-sky-400/10 border-sky-500/70 shadow-sky-500/30"
              : "bg-gradient-to-tr from-rose-500/30 to-rose-400/10 border-rose-500/70 shadow-rose-500/30"
          }
        `}>
          {isWin ? (
            <Trophy className="w-9 h-9 text-amber-400" />
          ) : isDraw ? (
            <Shield className="w-9 h-9 text-sky-400" />
          ) : (
            <XCircle className="w-9 h-9 text-rose-400" />
          )}
        </div>

        {/* Title & Subtitle */}
        <h2 className={`
          text-2xl sm:text-3xl font-black tracking-wider uppercase text-center
          ${isWin ? "text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]" : isDraw ? "text-sky-400" : "text-rose-400 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]"}
        `}>
          {title}
        </h2>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center mt-0.5 mb-4">
          {subtitle}
        </p>

        {/* Stats Bento Grid */}
        <div className="grid grid-cols-2 gap-2.5 w-full mb-4">
          {/* Final Score Card */}
          <div className="col-span-2 p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-center justify-between shadow-inner">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-500/40 text-amber-400">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Final Score</p>
                <p className="text-xs text-amber-400/80 font-semibold">Total Points</p>
              </div>
            </div>
            <span className="text-2xl font-black font-mono text-white tracking-tight">
              {stats.score.toLocaleString()}
            </span>
          </div>

          {/* Longest Combo Card */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Best Combo</span>
            </div>
            <span className="text-lg font-black font-mono text-amber-400">
              {stats.combosCount > 0 ? `${stats.combosCount}x` : "None"}
            </span>
          </div>

          {/* Sliced Fruits Card */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 mb-1">
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sliced</span>
            </div>
            <span className="text-lg font-black font-mono text-white">
              {stats.slicedCount} <span className="text-[10px] text-slate-500 font-bold uppercase">Fruits</span>
            </span>
          </div>
        </div>

        {/* Practice Reward Badge */}
        {!isMultiplayer && stats.score > 0 && (
          <div className="w-full py-2.5 px-3 bg-amber-500/10 border border-amber-500/30 rounded-xl font-bold text-xs text-amber-400 mb-4 flex items-center justify-center gap-2 shadow-sm">
            <Sparkles className="w-4 h-4 animate-pulse" />
            <span>+50 Coins Practice Reward Claimed!</span>
          </div>
        )}

        {/* Interactive Action Buttons */}
        <div className="flex flex-col gap-2.5 w-full">
          <button
            onClick={handlePlayAgain}
            className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.35)] transform hover:scale-[1.02] active:scale-[0.98] transition-all tracking-wider uppercase flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> {isMultiplayer ? "Rematch" : "Play Again"}
          </button>
          <button
            onClick={handleExit}
            className="w-full py-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs rounded-xl border border-slate-700/80 transition-colors uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" /> Exit to Lobby
          </button>
        </div>
      </div>
    </div>
  );
};

export default FruitNinjaOverlays;
