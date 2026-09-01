import React, { useEffect, useState } from "react";
import Phaser from "phaser";
import { FruitEvents } from "../phaser/events/FruitEvents";
import { Trophy, Shield, XCircle, RotateCcw, Sparkles, Flame, Zap, Award, LogOut, Loader2 } from "lucide-react";
import { useMultiplayerStore, type WinnerInfo } from "../../../store/multiplayerStore";
import type { FruitStats } from "../phaser/types/fruit.types";
import type { FruitNinjaState } from "@gaming-hub/game-engine";

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
  const [localStats, setLocalStats] = useState<FruitStats | null>(null);
  const [localEndReason, setLocalEndReason] = useState<string | null>(null);
  const [isLocalGameOver, setIsLocalGameOver] = useState(false);

  // Multiplayer store hooks
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const winner = useMultiplayerStore((s) => s.winner);
  const gameState = useMultiplayerStore((s) => s.gameState as unknown as FruitNinjaState | null);
  const room = useMultiplayerStore((s) => s.room);
  const rematchState = useMultiplayerStore((s) => s.rematchState);
  const requestRematch = useMultiplayerStore((s) => s.requestRematch);
  const acceptRematch = useMultiplayerStore((s) => s.acceptRematch);
  const leaveRoom = useMultiplayerStore((s) => s.leaveRoom);

  // Listen to Phaser scene game over events
  useEffect(() => {
    if (!game) return;

    let scene: Phaser.Scene | null = null;
    const timer = setInterval(() => {
      scene = game.scene.getScene("FruitNinjaScene");
      if (scene) {
        clearInterval(timer);

        const handleGameOver = (payload: { stats: FruitStats; winner?: WinnerInfo | null; endReason?: string }) => {
          const stats = payload?.stats || { score: 0, combosCount: 0, slicedCount: 0, bombsHit: 0, missedCount: 0 };
          setLocalStats(stats);
          if (payload?.endReason) {
            setLocalEndReason(payload.endReason);
          }
          setIsLocalGameOver(true);
        };

        scene.events.on(FruitEvents.GAME_OVER, handleGameOver);
      }
    }, 100);

    return () => {
      clearInterval(timer);
      if (scene) {
        scene.events.off(FruitEvents.GAME_OVER);
      }
    };
  }, [game, isMultiplayer]);

  // Reset overlay when a multiplayer rematch starts
  useEffect(() => {
    if (isMultiplayer && gameState && !gameState.finished && !winner) {
      setIsLocalGameOver(false);
      setLocalStats(null);
      setLocalEndReason(null);
    }
  }, [isMultiplayer, gameState, winner]);

  // Determine if the game over screen should be active
  const isMatchFinished = isMultiplayer
    ? Boolean(gameState?.finished || winner || isLocalGameOver)
    : isLocalGameOver;

  if (!isMatchFinished) return null;

  // Single-player resolution
  if (!isMultiplayer) {
    const stats = localStats || { score: 0, combosCount: 0, slicedCount: 0, bombsHit: 0, missedCount: 0 };
    const isWin = stats.score > 0;
    const title = stats.bombsHit > 0 ? "BOMB HIT!" : "TIME'S UP!";
    const subtitle = stats.score > 100 ? "Incredible Slicing!" : "Great Effort!";

    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-300 select-none overflow-y-auto">
        <div className={`pointer-events-none absolute w-96 h-96 rounded-full blur-3xl opacity-40 ${
          isWin ? "bg-amber-500" : "bg-rose-600"
        }`} />

        <div className={`
          relative flex flex-col items-center w-full max-w-sm sm:max-w-md p-4 sm:p-6 my-auto
          bg-slate-900/98 backdrop-blur-2xl max-h-[92vh] overflow-y-auto custom-scrollbar
          border-2 rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.9)]
          transform animate-in zoom-in-95 duration-200
          ${isWin ? "border-amber-500/60 shadow-amber-500/20" : "border-rose-500/60 shadow-rose-500/20"}
        `}>
          <div className={`
            w-16 h-16 rounded-2xl flex items-center justify-center border-2 mb-3 shadow-lg transform -translate-y-2
            ${isWin
              ? "bg-gradient-to-tr from-amber-500/30 to-amber-400/10 border-amber-500/70 shadow-amber-500/30 animate-bounce"
              : "bg-gradient-to-tr from-rose-500/30 to-rose-400/10 border-rose-500/70 shadow-rose-500/30"
            }
          `}>
            {isWin ? <Trophy className="w-9 h-9 text-amber-400" /> : <XCircle className="w-9 h-9 text-rose-400" />}
          </div>

          <h2 className={`
            text-2xl sm:text-3xl font-black tracking-wider uppercase text-center
            ${isWin ? "text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]" : "text-rose-400 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]"}
          `}>
            {title}
          </h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center mt-0.5 mb-4">
            {subtitle}
          </p>

          <div className="grid grid-cols-2 gap-2.5 w-full mb-4">
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

            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-col justify-between">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Best Combo</span>
              </div>
              <span className="text-lg font-black font-mono text-amber-400">
                {stats.combosCount > 0 ? `${stats.combosCount}x` : "None"}
              </span>
            </div>

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

          {stats.score > 0 && (
            <div className="w-full py-2.5 px-3 bg-amber-500/10 border border-amber-500/30 rounded-xl font-bold text-xs text-amber-400 mb-4 flex items-center justify-center gap-2 shadow-sm">
              <Sparkles className="w-4 h-4 animate-pulse" />
              <span>+50 Coins Practice Reward Claimed!</span>
            </div>
          )}

          <div className="flex flex-col gap-2.5 w-full">
            <button
              onClick={() => {
                setIsLocalGameOver(false);
                setLocalStats(null);
                onReplay();
              }}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.35)] transform hover:scale-[1.02] active:scale-[0.98] transition-all tracking-wider uppercase flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Play Again
            </button>
            <button
              onClick={() => {
                setIsLocalGameOver(false);
                onClose();
              }}
              className="w-full py-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs rounded-xl border border-slate-700/80 transition-colors uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <LogOut className="w-3.5 h-3.5" /> Exit to Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Multiplayer Outcome Calculations ──────────────────────────────────────
  const winnerSeats = winner?.winnerSeats ?? (
    gameState?.winnerSeats ?? (
      gameState?.winnerSeat !== null && gameState?.winnerSeat !== undefined ? [gameState.winnerSeat] : []
    )
  );

  const endReason = gameState?.endReason ?? localEndReason ?? "";

  // Check if resolution is known
  const hasFinished = Boolean(gameState?.finished || winner || (winnerSeats.length > 0));
  const isWin = mySeat !== null && winnerSeats.includes(mySeat);
  const isDraw = hasFinished && (winnerSeats.length === 0 || winnerSeats.length > 1);

  // Scores
  const p0Score = gameState?.scores?.[0] ?? gameState?.players?.[0]?.score ?? (mySeat === 0 ? (localStats?.score ?? 0) : 0);
  const p1Score = gameState?.scores?.[1] ?? gameState?.players?.[1]?.score ?? (mySeat === 1 ? (localStats?.score ?? 0) : 0);
  const myScore = mySeat === 1 ? p1Score : p0Score;
  const oppScore = mySeat === 1 ? p0Score : p1Score;

  // Title calculation
  let title = "MATCH ENDED";
  if (hasFinished) {
    if (isWin) title = "VICTORY!";
    else if (isDraw) title = "MATCH DRAW";
    else title = "DEFEAT";
  }

  // Subtitle calculation
  let subtitle = "Calculating final score...";
  if (endReason === "bomb_elimination") {
    subtitle = isWin ? "Opponent Hit A Bomb!" : "You Sliced A Bomb!";
  } else if (endReason === "player_eliminated") {
    subtitle = isWin ? "Opponent Lost All Lives!" : "You Ran Out Of Lives!";
  } else if (endReason === "timer_expired") {
    subtitle = isWin
      ? `Time's Up! Higher Score (${myScore} vs ${oppScore})`
      : isDraw
        ? `Time's Up! Equal Scores (${myScore} pts)`
        : `Time's Up! Lower Score (${myScore} vs ${oppScore})`;
  } else if (endReason === "resignation") {
    subtitle = isWin ? "Opponent Resigned!" : "You Resigned";
  } else if (hasFinished) {
    if (isWin) {
      subtitle = oppScore > 0 ? `You Won (${myScore} vs ${oppScore})` : "Highest Score Wins!";
    } else if (isDraw) {
      subtitle = `Equal Scores (${myScore} pts)`;
    } else {
      subtitle = oppScore > 0 ? `Opponent Won (${oppScore} vs ${myScore})` : "Better Luck Next Time!";
    }
  }

  // Rematch status
  const myUserId = room?.players.find((p) => p.seat === mySeat)?.id;
  const isRematchRequestedByMe = Boolean(myUserId && rematchState?.requestedBy?.includes(myUserId));
  const isRematchRequestedByOpponent = Boolean(rematchState?.active && rematchState.requestedBy.length > 0 && !isRematchRequestedByMe);

  const handleRematchAction = () => {
    if (isRematchRequestedByOpponent) {
      void acceptRematch();
    } else if (!isRematchRequestedByMe) {
      void requestRematch();
    }
  };

  const handleExitMatch = () => {
    void leaveRoom();
    onClose();
  };

  const stats = localStats || { score: myScore, combosCount: 0, slicedCount: 0, bombsHit: 0, missedCount: 0 };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-300 select-none overflow-y-auto">
      <div className={`pointer-events-none absolute w-96 h-96 rounded-full blur-3xl opacity-40 ${
        isWin ? "bg-amber-500" : isDraw ? "bg-sky-500" : "bg-rose-600"
      }`} />

      <div className={`
        relative flex flex-col items-center w-full max-w-sm sm:max-w-md p-4 sm:p-6 my-auto
        bg-slate-900/98 backdrop-blur-2xl max-h-[92vh] overflow-y-auto custom-scrollbar
        border-2 rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.9)]
        transform animate-in zoom-in-95 duration-200
        ${isWin ? "border-amber-500/60 shadow-amber-500/20" : isDraw ? "border-sky-500/60 shadow-sky-500/20" : "border-rose-500/60 shadow-rose-500/20"}
      `}>
        {/* Top Header Badge */}
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

        {/* Score Comparison Grid */}
        <div className="grid grid-cols-2 gap-2.5 w-full mb-4">
          {/* Your Score */}
          <div className={`p-3 rounded-2xl border flex flex-col justify-between ${
            isWin ? "bg-amber-500/10 border-amber-500/30" : "bg-slate-950/70 border-slate-800"
          }`}>
            <div className="flex items-center gap-1.5 mb-1">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Your Score</span>
            </div>
            <span className="text-xl font-black font-mono text-white">
              {myScore.toLocaleString()}
            </span>
          </div>

          {/* Opponent Score */}
          <div className={`p-3 rounded-2xl border flex flex-col justify-between ${
            !isWin && !isDraw ? "bg-rose-500/10 border-rose-500/30" : "bg-slate-950/70 border-slate-800"
          }`}>
            <div className="flex items-center gap-1.5 mb-1">
              <Award className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Opponent</span>
            </div>
            <span className="text-xl font-black font-mono text-slate-300">
              {oppScore.toLocaleString()}
            </span>
          </div>

          {/* Best Combo */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Best Combo</span>
            </div>
            <span className="text-lg font-black font-mono text-amber-400">
              {stats.combosCount > 0 ? `${stats.combosCount}x` : "None"}
            </span>
          </div>

          {/* Sliced Fruits */}
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

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 w-full">
          <button
            onClick={handleRematchAction}
            disabled={isRematchRequestedByMe}
            className={`
              w-full py-3.5 font-black text-xs rounded-xl shadow-lg transform transition-all tracking-wider uppercase flex items-center justify-center gap-2
              ${isRematchRequestedByMe
                ? "bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700"
                : isRematchRequestedByOpponent
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-emerald-500/30 hover:scale-[1.02] active:scale-[0.98]"
                  : "bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-500/30 hover:scale-[1.02] active:scale-[0.98]"
              }
            `}
          >
            {isRematchRequestedByMe ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Rematch Requested...
              </>
            ) : isRematchRequestedByOpponent ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" /> Accept Rematch!
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" /> Request Rematch
              </>
            )}
          </button>

          <button
            onClick={handleExitMatch}
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
