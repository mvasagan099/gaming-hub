import React, { useState, useEffect, useRef } from "react";
import { Trophy, RefreshCw, ArrowLeft, Clock, AlertTriangle, Sparkles, Volume2, VolumeX, Flame, Check, Video, Eye, EyeOff, RotateCw, Users } from "lucide-react";
import type { SnookerPlayer, SnookerBall, SnookerTarget, SnookerFrameStatus, SnookerBallType, SnookerFrameHistoryItem } from "@gaming-hub/game-engine";

interface SnookerHUDProps {
  player1Name?: string;
  player2Name?: string;
  players: SnookerPlayer[];
  currentSeat: number;
  mySeat: number;
  timeLeft: number;
  maxTime?: number;
  balls: SnookerBall[];
  targetBall: SnookerTarget;
  frameStatus: SnookerFrameStatus;
  currentBreak: number;
  redsRemaining: number;
  frameNumber: number;
  totalFrames: number;
  player1Score: number;
  player2Score: number;
  player1FramesWon: number;
  player2FramesWon: number;
  player1HighestBreak: number;
  player2HighestBreak: number;
  cueBallInHand: boolean;
  freeBallAvailable: boolean;
  nominatedBall: SnookerBallType | null;
  lastFoul: string | null;
  foulPoints: number;
  mode: "ai" | "multiplayer";
  cameraMode?: "3d" | "2d";
  setCameraMode?: React.Dispatch<React.SetStateAction<"3d" | "2d">>;
  onBack: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  isRotated?: boolean;
  onToggleRotate?: () => void;
  showMobileMatchPanelButton?: boolean;
  onOpenMobileMatchPanel?: () => void;
}

export const SnookerHUD: React.FC<SnookerHUDProps> = ({
  player1Name,
  player2Name,
  players,
  currentSeat,
  mySeat,
  timeLeft,
  maxTime = 20,
  balls,
  targetBall,
  frameStatus,
  currentBreak,
  redsRemaining,
  frameNumber,
  totalFrames,
  player1Score,
  player2Score,
  player1FramesWon,
  player2FramesWon,
  player1HighestBreak,
  player2HighestBreak,
  cueBallInHand,
  freeBallAvailable,
  nominatedBall,
  lastFoul,
  foulPoints,
  mode,
  cameraMode = "3d",
  setCameraMode,
  onBack,
  soundEnabled,
  setSoundEnabled,
  isRotated = false,
  onToggleRotate,
  showMobileMatchPanelButton = false,
  onOpenMobileMatchPanel,
}) => {
  const isMyTurn = currentSeat === mySeat;
  const timeRatio = Math.max(0, Math.min(1, timeLeft / maxTime));

  const [dismissedFoul, setDismissedFoul] = useState<string | null>(null);

  useEffect(() => {
    if (lastFoul) {
      setDismissedFoul(null);
      const t = setTimeout(() => setDismissedFoul(lastFoul), 6000);
      return () => clearTimeout(t);
    }
  }, [lastFoul]);

  const targetConfigMap: Record<string, { bg: string; border: string; dot: string; label: string; pts: string }> = {
    RED: { bg: "from-red-600/30 to-red-950/40", border: "border-red-500/50 text-red-300", dot: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]", label: "RED", pts: "1 PT" },
    COLOR: { bg: "from-amber-600/30 to-amber-950/40", border: "border-amber-500/50 text-amber-300", dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]", label: nominatedBall ? nominatedBall.toUpperCase() : "ANY COLOR", pts: "2-7 PTS" },
    YELLOW: { bg: "from-yellow-500/30 to-yellow-950/40", border: "border-yellow-400/50 text-yellow-300", dot: "bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]", label: "YELLOW", pts: "2 PTS" },
    GREEN: { bg: "from-emerald-600/30 to-emerald-950/40", border: "border-emerald-500/50 text-emerald-300", dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]", label: "GREEN", pts: "3 PTS" },
    BROWN: { bg: "from-amber-800/30 to-amber-950/40", border: "border-amber-700/50 text-amber-300", dot: "bg-amber-700 shadow-[0_0_8px_rgba(180,83,9,0.8)]", label: "BROWN", pts: "4 PTS" },
    BLUE: { bg: "from-blue-600/30 to-blue-950/40", border: "border-blue-500/50 text-blue-300", dot: "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]", label: "BLUE", pts: "5 PTS" },
    PINK: { bg: "from-pink-600/30 to-pink-950/40", border: "border-pink-500/50 text-pink-300", dot: "bg-pink-400 shadow-[0_0_8px_rgba(244,114,182,0.8)]", label: "PINK", pts: "6 PTS" },
    BLACK: { bg: "from-zinc-800/50 to-zinc-950/60", border: "border-zinc-500/50 text-zinc-200", dot: "bg-zinc-200 shadow-[0_0_8px_rgba(255,255,255,0.6)]", label: "BLACK", pts: "7 PTS" },
    FREE_BALL: { bg: "from-purple-600/30 to-purple-950/40", border: "border-purple-500/50 text-purple-300", dot: "bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]", label: nominatedBall ? `FREE (${nominatedBall.toUpperCase()})` : "FREE BALL", pts: "CHOICE" },
  };

  const targetCfg = targetConfigMap[targetBall] || targetConfigMap.RED;

  return (
    <div className="relative z-30 w-full shrink-0 flex flex-col gap-1 sm:gap-2 pointer-events-none select-none">
      {/* ── 1. Top Broadcast TV Scoreboard ───────────────────────────────── */}
      <div className="w-full bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 rounded-xl sm:rounded-2xl p-1 sm:p-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.5)] pointer-events-auto">
        {/* MOBILE VIEW (< md): Ultra-compact broadcast strip */}
        <div className="flex flex-col gap-1 md:hidden">
          {/* Mobile Top Row: Controls (Left) + Match Status/Timer (Center) + Utilities (Right) */}
          <div className="flex items-center justify-between gap-1 w-full">
            {/* Left: Exit & Rotate */}
            <div className="flex items-center gap-1 shrink-0">
              {mode !== "multiplayer" && (
                <button
                  onClick={onBack}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-[10px] font-semibold border border-slate-700/60 active:scale-95"
                  title="Leave Match"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Exit</span>
                </button>
              )}

              {onToggleRotate && (
                <button
                  onClick={onToggleRotate}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg transition-all text-[10px] font-bold border active:scale-95 ${
                    isRotated
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm"
                      : "bg-slate-800/90 text-slate-300 border-slate-700/60 hover:bg-slate-700"
                  }`}
                  title="Rotate Table Orientation"
                >
                  <RotateCw className="w-3 h-3 text-amber-400" />
                  <span>{isRotated ? "Vert" : "Horiz"}</span>
                </button>
              )}
            </div>

            {/* Center: Frame, Turn Indicator, and Timer Countdown */}
            <div className="flex items-center gap-1.5 bg-slate-950/70 px-2 py-0.5 rounded-full border border-slate-800/80 shrink-0">
              <span className="text-[9px] font-black tracking-wide text-slate-400">
                F{frameNumber}{totalFrames > 1 ? `/${totalFrames}` : ""}
              </span>
              <span className="text-slate-600 font-bold text-[9px]">•</span>
              {isMyTurn ? (
                <span className="text-emerald-400 flex items-center gap-1 font-black text-[10px] animate-pulse">
                  <Sparkles className="w-2.5 h-2.5 text-emerald-400" /> YOUR TURN
                </span>
              ) : (
                <span className="text-rose-400 flex items-center gap-1 font-bold text-[10px]">
                  <Clock className="w-2.5 h-2.5 text-rose-400" /> OPPONENT
                </span>
              )}
              <span className="text-slate-600 font-bold text-[9px]">•</span>
              <span className={`text-[10px] font-mono font-black ${
                timeLeft <= 5 ? "text-rose-400 animate-pulse" : timeLeft <= 10 ? "text-amber-400" : "text-emerald-400"
              }`}>
                {timeLeft}s
              </span>
            </div>

            {/* Right: Details (if MP) & Sound */}
            <div className="flex items-center gap-1 shrink-0">
              {showMobileMatchPanelButton && onOpenMobileMatchPanel && (
                <button
                  onClick={onOpenMobileMatchPanel}
                  className="px-1.5 py-0.5 rounded-lg bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-[10px] font-bold hover:bg-indigo-600/40 active:scale-95 flex items-center gap-1"
                  title="Match Details & Chat"
                >
                  <Users className="w-3 h-3" />
                  <span>Info</span>
                </button>
              )}
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700/60 active:scale-95"
                title={soundEnabled ? "Mute Audio" : "Unmute Audio"}
              >
                {soundEnabled ? <Volume2 className="w-3 h-3 text-emerald-400" /> : <VolumeX className="w-3 h-3 text-slate-500" />}
              </button>
            </div>
          </div>

          {/* Mobile Bottom Row: Streamlined Broadcast Score Ribbon */}
          <div className="flex items-center justify-between gap-1 w-full bg-slate-950/60 rounded-xl px-1.5 py-0.5 border border-slate-800/80">
            {/* Player 1 Pill */}
            <div className={`flex items-center gap-1.5 min-w-0 flex-1 px-1.5 py-0.5 rounded-lg transition-all ${
              currentSeat === 0
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                : "text-slate-300"
            }`}>
              {currentSeat === 0 && (
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-full w-full bg-amber-400" />
                </span>
              )}
              <span className="text-[10px] font-bold truncate max-w-[65px]">
                {mySeat === 0 ? (player1Name ? `${player1Name} (You)` : "You") : (player1Name || "Player 1")}
              </span>
              <span className="text-[9px] text-amber-400 font-mono font-semibold">
                F:{player1FramesWon}
              </span>
              <span className="ml-auto text-base font-black font-mono text-white px-0.5">
                {player1Score}
              </span>
            </div>

            {/* Center Separator */}
            <div className="px-1 text-slate-600 font-mono font-bold text-[10px] shrink-0">
              -
            </div>

            {/* Player 2 Pill */}
            <div className={`flex items-center gap-1.5 min-w-0 flex-1 px-1.5 py-0.5 rounded-lg transition-all justify-end ${
              currentSeat === 1
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm"
                : "text-slate-300"
            }`}>
              <span className="mr-auto text-base font-black font-mono text-white px-0.5">
                {player2Score}
              </span>
              <span className="text-[9px] text-blue-400 font-mono font-semibold">
                F:{player2FramesWon}
              </span>
              <span className="text-[10px] font-bold truncate max-w-[65px] text-right">
                {mySeat === 1 ? (player2Name ? `${player2Name} (You)` : "You") : mode === "ai" ? "AI Bot" : (player2Name || "Player 2")}
              </span>
              {currentSeat === 1 && (
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-full w-full bg-blue-400" />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* DESKTOP VIEW (md:flex): Spacious Championship Broadcast HUD */}
        <div className="hidden md:flex md:items-center md:justify-between md:gap-8">
          {/* Desktop Toolbar */}
          <div className="flex items-center gap-2">
            {mode !== "multiplayer" && <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs font-semibold border border-slate-700/60 hover:scale-105 active:scale-95"
              title="Leave Match"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Exit</span>
            </button>}

            {onToggleRotate && (
              <button
                onClick={onToggleRotate}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all text-xs font-bold border hover:scale-105 active:scale-95 ${
                  isRotated
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm"
                    : "bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-700"
                }`}
                title="Rotate Table Orientation"
              >
                <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                <span>{isRotated ? "Vertical Table" : "Horizontal Table"}</span>
              </button>
            )}
          </div>

          {/* Player 1 Card */}
          <div
            className={`min-w-0 flex items-center gap-1.5 sm:gap-3 px-4 py-2 rounded-xl transition-all duration-300 flex-initial ${
              currentSeat === 0
                ? "bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-slate-900/40 border-2 border-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.25)]"
                : "bg-slate-800/40 border border-slate-700/50 opacity-85"
            }`}
          >
            <div className="flex w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 items-center justify-center font-black text-white shadow-md text-xs border border-amber-300/40 shrink-0">
              P1
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-slate-100 truncate max-w-[110px]">
                  {mySeat === 0 ? (player1Name ? `${player1Name} (You)` : "You") : (player1Name || "Player 1")}
                </span>
                {currentSeat === 0 && (
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-full w-full bg-amber-400"></span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold">
                <span className="text-amber-400 font-bold">F:{player1FramesWon}</span>
                {player1HighestBreak > 0 && <span>H:{player1HighestBreak}</span>}
              </div>
            </div>
            <div className="text-3xl font-black text-white px-1 font-mono shrink-0">
              {player1Score}
            </div>
          </div>

          {/* Center Match Frame & Countdown Hub */}
          <div className="flex flex-col items-center justify-center shrink-0 px-1">
            <div className="text-[10px] font-black tracking-wider text-slate-400 uppercase whitespace-nowrap">
              FRAME {frameNumber}{totalFrames > 1 ? `/${totalFrames}` : ""}
            </div>

            <div className="flex items-center gap-1 text-xs font-bold mt-0.5">
              {isMyTurn ? (
                <span className="text-emerald-400 flex items-center gap-1 animate-pulse font-extrabold tracking-wide text-xs">
                  <Sparkles className="w-3 h-3 text-emerald-400" /> YOUR TURN
                </span>
              ) : (
                <span className="text-rose-400 flex items-center gap-1 font-bold text-xs">
                  <Clock className="w-3 h-3 text-rose-400" /> OPPONENT
                </span>
              )}
            </div>

            {/* Countdown Progress Bar */}
            <div className="w-28 h-1.5 bg-slate-950 rounded-full mt-1 overflow-hidden border border-slate-700/80">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  timeLeft <= 5
                    ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse"
                    : timeLeft <= 10
                    ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
                    : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                }`}
                style={{ width: `${timeRatio * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-400 mt-0.5">
              {timeLeft}s
            </span>
          </div>

          {/* Player 2 Card */}
          <div
            className={`min-w-0 flex items-center gap-1.5 sm:gap-3 px-4 py-2 rounded-xl transition-all duration-300 flex-initial justify-end ${
              currentSeat === 1
                ? "bg-gradient-to-l from-blue-500/20 via-blue-500/10 to-slate-900/40 border-2 border-blue-400 shadow-[0_0_25px_rgba(59,130,246,0.25)]"
                : "bg-slate-800/40 border border-slate-700/50 opacity-85"
            }`}
          >
            <div className="text-3xl font-black text-white px-1 font-mono shrink-0">
              {player2Score}
            </div>
            <div className="min-w-0 flex-1 text-right">
              <div className="flex items-center justify-end gap-1">
                {currentSeat === 1 && (
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-full w-full bg-blue-400"></span>
                  </span>
                )}
                <span className="text-xs font-bold text-slate-100 truncate max-w-[110px]">
                  {mySeat === 1 ? (player2Name ? `${player2Name} (You)` : "You") : mode === "ai" ? "AI Bot" : (player2Name || "Player 2")}
                </span>
              </div>
              <div className="flex items-center justify-end gap-1.5 text-[10px] text-slate-400 font-semibold">
                {player2HighestBreak > 0 && <span>H:{player2HighestBreak}</span>}
                <span className="text-blue-400 font-bold">F:{player2FramesWon}</span>
              </div>
            </div>
            <div className="flex w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-blue-400 items-center justify-center font-black text-white shadow-md text-xs border border-blue-300/40 shrink-0">
              {mode === "ai" ? "AI" : "P2"}
            </div>
          </div>

          {/* Desktop Audio & Details Toggle */}
          <div className="flex items-center gap-2">
            {showMobileMatchPanelButton && onOpenMobileMatchPanel && (
              <button
                onClick={onOpenMobileMatchPanel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-300 transition-all text-xs font-semibold border border-indigo-500/40 hover:scale-105 active:scale-95"
                title="Match Details & Chat"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Details</span>
              </button>
            )}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs border border-slate-700/60 hover:scale-105 active:scale-95"
              title={soundEnabled ? "Mute Audio" : "Unmute Audio"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── 2. Compact Centered Target & Break Strip ──────────────────────── */}
      <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
        {/* Authoritative Target Ball Badge */}
        <div className={`px-2 sm:px-3.5 py-0.5 sm:py-1.5 rounded-full bg-gradient-to-r ${targetCfg.bg} border ${targetCfg.border} backdrop-blur-md shadow-sm sm:shadow-md flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-black tracking-wide uppercase`}>
          <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${targetCfg.dot}`} />
          <span>TARGET: {targetCfg.label}</span>
          <span className="text-[9px] sm:text-[10px] opacity-80 font-normal">({targetCfg.pts})</span>
        </div>

        {/* Current Break Counter */}
        {currentBreak > 0 && (
          <div className="px-2 sm:px-3.5 py-0.5 sm:py-1.5 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-slate-950 font-black text-[10px] sm:text-xs shadow-md uppercase tracking-wider flex items-center gap-1 sm:gap-1.5 animate-pulse">
            <Flame className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current text-slate-950" />
            <span>BREAK: {currentBreak}</span>
          </div>
        )}

        {/* Reds Remaining Pill */}
        <div className="px-2 sm:px-3 py-0.5 sm:py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-800 text-slate-300 font-bold text-[10px] sm:text-xs shadow-sm sm:shadow-md flex items-center gap-1 sm:gap-1.5">
          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-red-500" />
          <span>{redsRemaining > 0 ? `${redsRemaining} Reds Left` : "Clearance Phase"}</span>
        </div>

        {/* Ball in Hand Notification */}
        {cueBallInHand && (
          <div className="px-2 sm:px-3.5 py-0.5 sm:py-1.5 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-white font-black text-[10px] sm:text-xs shadow-md uppercase tracking-wider flex items-center gap-1 sm:gap-1.5 animate-bounce">
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>Ball in Hand (Tap inside 'D')</span>
          </div>
        )}

        {/* Free Ball Notification */}
        {freeBallAvailable && (
          <div className="px-2 sm:px-3.5 py-0.5 sm:py-1.5 rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-black text-[10px] sm:text-xs shadow-md uppercase tracking-wider flex items-center gap-1 sm:gap-1.5">
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>Free Ball Nominated</span>
          </div>
        )}

        {/* Foul Compact Banner (Auto-Dismissable) */}
        {lastFoul && dismissedFoul !== lastFoul && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 max-w-[calc(100vw-1rem)] whitespace-nowrap px-2.5 sm:px-3.5 py-0.5 sm:py-1 rounded-full bg-rose-900/90 border border-rose-500/80 text-rose-200 font-bold text-[10px] sm:text-xs shadow-lg flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            <span className="max-w-[220px] truncate">{lastFoul}</span>
            <span className="text-amber-300 font-mono font-black">(+{foulPoints})</span>
          </div>
        )}
      </div>
    </div>
  );
};

interface ColorPickerModalProps {
  onSelectColor: (color: SnookerBallType) => void;
  nominatedColor: SnookerBallType | null;
  isFreeBall?: boolean;
}

export const ColorPickerModal: React.FC<ColorPickerModalProps> = ({
  onSelectColor,
  nominatedColor,
  isFreeBall = false,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  // If nomination is cleared (e.g. new shot / turn / foul), restore expanded view
  useEffect(() => {
    if (!nominatedColor) {
      setIsMinimized(false);
    }
  }, [nominatedColor]);

  const effectiveNominated = nominatedColor;

  const colors: { type: SnookerBallType; label: string; bg: string; border: string; pts: number; key: string }[] = [
    { type: "yellow", label: "Yellow", bg: "bg-yellow-400 text-slate-950", border: "border-yellow-300", pts: 2, key: "1" },
    { type: "green", label: "Green", bg: "bg-emerald-600 text-white", border: "border-emerald-400", pts: 3, key: "2" },
    { type: "brown", label: "Brown", bg: "bg-amber-800 text-white", border: "border-amber-600", pts: 4, key: "3" },
    { type: "blue", label: "Blue", bg: "bg-blue-600 text-white", border: "border-blue-400", pts: 5, key: "4" },
    { type: "pink", label: "Pink", bg: "bg-pink-500 text-white", border: "border-pink-300", pts: 6, key: "5" },
    { type: "black", label: "Black", bg: "bg-zinc-950 text-white", border: "border-zinc-600", pts: 7, key: "6" },
  ];

  const selectedColorObj = colors.find((c) => c.type === effectiveNominated);

  // Minimized Compact State
  if (isMinimized && effectiveNominated && selectedColorObj) {
    return (
      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-top-2 pointer-events-auto">
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="group flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-900/95 hover:bg-slate-800/95 backdrop-blur-xl border border-slate-700/80 hover:border-amber-400/60 shadow-[0_10px_30px_rgba(0,0,0,0.8)] text-xs transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
          title="Click to expand and change nominated color"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Target:</span>
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black border flex items-center gap-1 shadow-sm ${selectedColorObj.bg} ${selectedColorObj.border}`}>
            <span>{selectedColorObj.label}</span>
            <span className="text-[9px] opacity-80">+{selectedColorObj.pts} PTS</span>
          </span>
          <div className="w-px h-3.5 bg-slate-700 group-hover:bg-slate-600" />
          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400 group-hover:text-amber-300">
            <Eye className="w-3.5 h-3.5" />
            <span>Change</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-4 sm:p-5 shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 pointer-events-auto max-w-[calc(100vw-1.5rem)]">
      <div className="w-full flex items-center justify-between gap-3">
        <div className="text-xs font-black tracking-wider uppercase text-slate-200 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{isFreeBall ? "Nominate Free Ball" : "Nominate Target Color"}</span>
        </div>
        {effectiveNominated && (
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700 active:scale-95 border border-slate-600/80 text-xs font-bold text-slate-200 hover:text-white shadow transition-all cursor-pointer animate-in fade-in"
            title="Minimize popup to view table"
          >
            <EyeOff className="w-3.5 h-3.5 text-amber-400" />
            <span>Hide</span>
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto max-w-full py-0.5">
        {colors.map((c) => (
          <button
            key={c.type}
            type="button"
            onClick={() => {
              if (effectiveNominated === c.type) {
                // If user clicks the already selected option, minimize the popup
                setIsMinimized(true);
                return;
              }
              onSelectColor(c.type);
            }}
            className={`px-3.5 py-2.5 rounded-2xl font-black text-xs shadow-lg transition-all transform hover:scale-105 active:scale-95 flex flex-col items-center gap-1 cursor-pointer border ${
              c.bg
            } ${c.border} ${
              effectiveNominated === c.type
                ? "ring-4 ring-white ring-offset-2 ring-offset-slate-900 scale-105"
                : "opacity-90 hover:opacity-100"
            }`}
          >
            <div className="flex items-center gap-1">
              <span>{c.label}</span>
              {effectiveNominated === c.type && <Check className="w-3.5 h-3.5" />}
            </div>
            <span className="text-[10px] opacity-85 font-mono">+{c.pts} PTS</span>
          </button>
        ))}
      </div>
    </div>
  );
};

interface SnookerMobilePowerMeterProps {
  power: number;
  setPower: (p: number) => void;
  onShoot: (p: number) => void;
  disabled?: boolean;
}

export const SnookerMobilePowerMeter: React.FC<SnookerMobilePowerMeterProps> = ({
  power,
  setPower,
  onShoot,
  disabled = false,
}) => {
  const isDraggingRef = useRef(false);
  const meterRef = useRef<HTMLDivElement | null>(null);

  const calculatePower = (clientY: number) => {
    if (!meterRef.current) return 0.05;
    const rect = meterRef.current.getBoundingClientRect();
    // Top is 0.05 (low power), Bottom is 1.0 (max power)
    const ratio = (clientY - rect.top) / rect.height;
    return Math.min(1.0, Math.max(0.05, ratio));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    isDraggingRef.current = true;
    const p = calculatePower(e.clientY);
    setPower(p);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !isDraggingRef.current) return;
    const p = calculatePower(e.clientY);
    setPower(p);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    const p = calculatePower(e.clientY);
    setPower(p);
    if (p >= 0.05) {
      onShoot(p);
    }
  };

  // Percentage height fill from top down
  const fillPct = Math.max(5, Math.min(100, Math.round(power * 100)));

  return (
    <div
      ref={meterRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { isDraggingRef.current = false; }}
      className={`w-6 sm:w-8 md:w-9 h-[min(36vh,260px)] sm:h-[min(50vh,340px)] bg-slate-950/95 rounded-xl border transition-all ${
        disabled
          ? "border-slate-800 opacity-40 cursor-not-allowed"
          : "border-slate-700/80 hover:border-amber-400 shadow-[0_0_15px_rgba(0,0,0,0.8)] cursor-pointer active:scale-95"
      } flex flex-col items-center justify-between p-0.5 sm:p-1 relative select-none touch-none overflow-hidden`}
      title="Drag down to set Shot Power and release to Strike (or pull back cue)"
      aria-label="Shot Power Level Meter"
    >
      {/* Background Level Meter with Segmented Rainbow Gradient */}
      <div className="absolute inset-0.5 sm:inset-1 rounded-lg bg-slate-900/90 overflow-hidden flex flex-col justify-start">
        {/* Dynamic Power Fill Bar (Top to Bottom) */}
        <div
          className="w-full transition-[height] duration-75 ease-out relative shadow-[0_0_10px_rgba(245,158,11,0.5)]"
          style={{
            height: `${fillPct}%`,
            background: "linear-gradient(to bottom, #10b981 0%, #84cc16 30%, #eab308 60%, #f97316 80%, #ef4444 100%)",
          }}
        >
          {/* Active Tip Glow Indicator */}
          <div className="absolute bottom-0 inset-x-0 h-1 sm:h-1.5 bg-white shadow-[0_0_6px_#ffffff] rounded-full" />
        </div>

        {/* Segmented Tick Overlay (10 Ticks) */}
        <div className="absolute inset-0 flex flex-col justify-between py-1 px-0.5 pointer-events-none opacity-40">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className={`w-full h-[1px] ${i % 3 === 0 ? "bg-white/80 h-[1.5px]" : "bg-black/60"}`}
            />
          ))}
        </div>
      </div>

      {/* Top Header: Power % Badge */}
      <div className="z-10 bg-slate-950/90 backdrop-blur-md px-1 sm:px-1.5 py-0.5 rounded border border-slate-700/80 shadow-sm mt-0.5">
        <span className="text-[8px] sm:text-[10px] font-mono font-black text-amber-400">
          {Math.round(power * 100)}%
        </span>
      </div>

      {/* Bottom Label */}
      <div className="z-10 text-[7px] sm:text-[9px] font-black tracking-widest text-slate-300 uppercase py-0.5">
        PWR
      </div>
    </div>
  );
};

interface SnookerPowerControlProps {
  power: number;
  setPower: (p: number) => void;
  disabled?: boolean;
}

export const SnookerPowerControl: React.FC<SnookerPowerControlProps> = ({
  power,
  setPower,
  disabled = false,
}) => {
  return (
    <div className="flex flex-col items-center bg-slate-900/90 backdrop-blur-md border border-slate-800 p-3 rounded-2xl shadow-xl select-none w-full">
      <div className="flex items-center justify-between w-full mb-2">
        <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
          POWER
        </span>
        <span className="text-xs font-mono font-black text-amber-400">
          {Math.round(power * 100)}%
        </span>
      </div>

      <div className="relative h-32 w-7 bg-slate-950 rounded-full p-1 border border-slate-800 flex flex-col justify-end overflow-hidden">
        <div
          className="w-full rounded-full transition-all duration-75 bg-gradient-to-t from-emerald-500 via-amber-400 to-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.5)]"
          style={{ height: `${power * 100}%` }}
        />
        <input
          type="range"
          min="0.05"
          max="1.0"
          step="0.01"
          value={power}
          disabled={disabled}
          onChange={(e) => setPower(parseFloat(e.target.value))}
          className="absolute inset-0 opacity-0 cursor-pointer h-full w-full"
        />
      </div>

      {/* Preset Quick Power Buttons */}
      <div className="grid grid-cols-4 gap-1 w-full mt-2.5">
        {[0.25, 0.5, 0.75, 1.0].map((pVal) => (
          <button
            key={pVal}
            onClick={() => setPower(pVal)}
            disabled={disabled}
            className={`py-1 rounded-lg text-[9px] font-bold font-mono transition-all border ${
              Math.abs(power - pVal) < 0.05
                ? "bg-amber-400 text-slate-950 border-amber-300 font-black shadow-sm"
                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
            }`}
          >
            {pVal * 100}%
          </button>
        ))}
      </div>
    </div>
  );
};

interface SnookerSpinControlProps {
  spinX: number;
  spinY: number;
  setSpin: (x: number, y: number) => void;
}

export const SnookerSpinControl: React.FC<SnookerSpinControlProps> = ({
  spinX,
  spinY,
  setSpin,
}) => {
  const handleBallClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    const dist = Math.hypot(x, y);
    if (dist <= 1) {
      setSpin(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
    }
  };

  const getSpinLabel = () => {
    if (spinY < -0.3) return "Top Spin (Follow)";
    if (spinY > 0.3) return "Back Spin (Screw)";
    if (spinX < -0.3) return "Left English";
    if (spinX > 0.3) return "Right English";
    return "Center Cue Ball";
  };

  return (
    <div className="flex flex-col items-center bg-slate-900/90 backdrop-blur-md border border-slate-800 p-3 rounded-2xl shadow-xl select-none w-full">
      <div className="flex items-center justify-between w-full mb-2">
        <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
          SPIN / ENGLISH
        </span>
        <button
          onClick={() => setSpin(0, 0)}
          className="text-[9px] text-slate-400 hover:text-white transition-colors bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700"
        >
          Center
        </button>
      </div>

      <div
        onClick={handleBallClick}
        className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-slate-200 via-slate-100 to-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.3)] border-2 border-slate-300 cursor-crosshair flex items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-x-0 top-1/2 h-px bg-slate-400/40" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-400/40" />
        <div
          className="absolute w-3.5 h-3.5 rounded-full bg-sky-500 border border-white shadow-md transform -translate-x-1/2 -translate-y-1/2 transition-all duration-75"
          style={{
            left: `${((spinX + 1) / 2) * 100}%`,
            top: `${((spinY + 1) / 2) * 100}%`,
          }}
        />
      </div>

      <span className="text-[9px] font-semibold text-slate-400 mt-2 text-center truncate w-full">
        {getSpinLabel()}
      </span>
    </div>
  );
};

interface SnookerGameOverModalProps {
  frameStatus: SnookerFrameStatus;
  winnerSeats: number[];
  mySeat: number;
  player1Score: number;
  player2Score: number;
  player1FramesWon: number;
  player2FramesWon: number;
  frameNumber: number;
  totalFrames: number;
  frameHistory: SnookerFrameHistoryItem[];
  onNextFrame?: () => void;
  onRematch?: () => void;
  onExit: () => void;
}

export const SnookerGameOverModal: React.FC<SnookerGameOverModalProps> = ({
  frameStatus,
  winnerSeats,
  mySeat,
  player1Score,
  player2Score,
  player1FramesWon,
  player2FramesWon,
  frameNumber,
  totalFrames,
  frameHistory,
  onNextFrame,
  onRematch,
  onExit,
}) => {
  const isWinner = winnerSeats.includes(mySeat);
  const isMatchOver = frameStatus === "MATCH_END";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 shadow-xl ${
            isWinner
              ? "bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950"
              : "bg-slate-800 text-slate-400"
          }`}
        >
          <Trophy className="w-10 h-10" />
        </div>

        <h2 className="text-3xl font-black text-white mb-1">
          {isMatchOver
            ? isWinner
              ? "MATCH WON!"
              : "MATCH LOST"
            : isWinner
            ? `FRAME ${frameNumber} WON!`
            : `FRAME ${frameNumber} LOST`}
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          {isMatchOver
            ? "Outstanding championship snooker performance!"
            : `Frame ${frameNumber} concluded. Prepare for the next frame!`}
        </p>

        {/* Current Score Summary */}
        <div className="w-full bg-slate-950/60 rounded-2xl p-4 border border-slate-800/80 mb-4 flex justify-around">
          <div>
            <div className="text-xs text-slate-400 font-semibold">Your Score</div>
            <div className="text-2xl font-black text-amber-400">
              {mySeat === 0 ? player1Score : player2Score}
            </div>
            <div className="text-[10px] text-slate-500">
              Frames Won: {mySeat === 0 ? player1FramesWon : player2FramesWon}
            </div>
          </div>
          <div className="w-px bg-slate-800" />
          <div>
            <div className="text-xs text-slate-400 font-semibold">Opponent Score</div>
            <div className="text-2xl font-black text-slate-300">
              {mySeat === 0 ? player2Score : player1Score}
            </div>
            <div className="text-[10px] text-slate-500">
              Frames Won: {mySeat === 0 ? player2FramesWon : player1FramesWon}
            </div>
          </div>
        </div>

        {/* Multi-Frame History Table */}
        {frameHistory && frameHistory.length > 0 && (
          <div className="w-full mb-6 bg-slate-950/40 rounded-xl p-3 border border-slate-800 text-left">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Frame Breakdown
            </div>
            <div className="flex flex-col gap-1 max-h-28 overflow-y-auto pr-1">
              {frameHistory.map((f) => (
                <div key={f.frameNumber} className="flex justify-between text-xs text-slate-300 py-0.5 border-b border-slate-800/50">
                  <span className="font-semibold">Frame {f.frameNumber}</span>
                  <span className="font-mono">
                    {f.player1Score} - {f.player2Score} {f.winnerSeat === 0 ? "(P1 won)" : f.winnerSeat === 1 ? "(P2 won)" : "(Tie)"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 w-full">
          {!isMatchOver && onNextFrame && (
            <button
              onClick={onNextFrame}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              Next Frame →
            </button>
          )}
          {isMatchOver && onRematch && (
            <button
              onClick={onRematch}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Rematch
            </button>
          )}
          <button
            onClick={onExit}
            className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Lobby
          </button>
        </div>
      </div>
    </div>
  );
};
