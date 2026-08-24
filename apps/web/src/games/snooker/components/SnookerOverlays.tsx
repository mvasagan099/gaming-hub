import React from "react";
import { Trophy, RefreshCw, ArrowLeft, Clock, AlertTriangle, Sparkles, Volume2, VolumeX, Flame, Check } from "lucide-react";
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
  onBack: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
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
  onBack,
  soundEnabled,
  setSoundEnabled,
}) => {
  const isMyTurn = currentSeat === mySeat;
  const timeRatio = Math.max(0, Math.min(1, timeLeft / maxTime));

  const targetColorMap: Record<string, { bg: string; text: string }> = {
    RED: { bg: "bg-red-600/90 text-white", text: "RED (1 pt)" },
    COLOR: { bg: "bg-amber-500/90 text-slate-950", text: nominatedBall ? `${nominatedBall.toUpperCase()} ON` : "ANY COLOR (2-7 pts)" },
    YELLOW: { bg: "bg-yellow-500/90 text-slate-950", text: "YELLOW (2 pts)" },
    GREEN: { bg: "bg-emerald-600/90 text-white", text: "GREEN (3 pts)" },
    BROWN: { bg: "bg-amber-800/90 text-white", text: "BROWN (4 pts)" },
    BLUE: { bg: "bg-blue-600/90 text-white", text: "BLUE (5 pts)" },
    PINK: { bg: "bg-pink-500/90 text-white", text: "PINK (6 pts)" },
    BLACK: { bg: "bg-zinc-900 border border-zinc-700 text-white", text: "BLACK (7 pts)" },
    FREE_BALL: { bg: "bg-purple-600/90 text-white", text: nominatedBall ? `FREE BALL (${nominatedBall.toUpperCase()})` : "FREE BALL (Pick Any)" },
  };

  const targetBadge = targetColorMap[targetBall] || targetColorMap.RED;

  return (
    <div className="w-full flex flex-col gap-2 pointer-events-none select-none">
      {/* Top Broadcast Scoreboard Header */}
      <div className="flex items-center justify-between gap-4 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl px-5 py-3 shadow-2xl pointer-events-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Exit
        </button>

        {/* Center Snooker Match Scoreboard */}
        <div className="flex items-center gap-6">
          {/* Player 1 Card */}
          <div
            className={`flex items-center gap-3 px-4 py-2 rounded-xl transition-all ${
              currentSeat === 0
                ? "bg-amber-500/20 border-2 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                : "bg-slate-800/60 border border-slate-700/60"
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center font-bold text-white shadow-md text-xs">
              P1
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-200">
                  {mySeat === 0 ? (player1Name ? `${player1Name} (You)` : "You") : (player1Name || "Player 1")}
                </span>
                {currentSeat === 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                )}
              </div>
              <div className="text-[11px] text-amber-400 font-semibold">
                Frames: {player1FramesWon}
              </div>
              {player1HighestBreak > 0 && (
                <div className="text-[9px] text-slate-400">High: {player1HighestBreak}</div>
              )}
            </div>
            <div className="text-2xl font-black text-white pl-2">{player1Score}</div>
          </div>

          {/* Center Frame & Turn Status */}
          <div className="flex flex-col items-center justify-center min-w-[140px]">
            <div className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
              FRAME {frameNumber} {totalFrames > 1 ? `(Best of ${totalFrames})` : ""}
            </div>

            <div className="flex items-center gap-1 text-xs font-bold mt-0.5">
              {isMyTurn ? (
                <span className="text-emerald-400 flex items-center gap-1 animate-pulse">
                  <Sparkles className="w-3.5 h-3.5" /> YOUR TURN
                </span>
              ) : (
                <span className="text-rose-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> OPPONENT
                </span>
              )}
            </div>

            {/* 20s Turn Countdown Progress Bar */}
            <div className="w-28 h-1.5 bg-slate-800 rounded-full mt-1.5 overflow-hidden border border-slate-700/80">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  timeLeft <= 5 ? "bg-rose-500 animate-pulse" : timeLeft <= 10 ? "bg-amber-500" : "bg-emerald-500"
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
            className={`flex items-center gap-3 px-4 py-2 rounded-xl transition-all ${
              currentSeat === 1
                ? "bg-blue-500/20 border-2 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                : "bg-slate-800/60 border border-slate-700/60"
            }`}
          >
            <div className="text-2xl font-black text-white pr-2">{player2Score}</div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                {currentSeat === 1 && (
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                )}
                <span className="text-xs font-bold text-slate-200">
                  {mySeat === 1 ? (player2Name ? `${player2Name} (You)` : "You") : mode === "ai" ? "AI Bot" : (player2Name || "Player 2")}
                </span>
              </div>
              <div className="text-[11px] text-blue-400 font-semibold">
                Frames: {player2FramesWon}
              </div>
              {player2HighestBreak > 0 && (
                <div className="text-[9px] text-slate-400">High: {player2HighestBreak}</div>
              )}
            </div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center font-bold text-white shadow-md text-xs">
              {mode === "ai" ? "AI" : "P2"}
            </div>
          </div>
        </div>

        {/* Audio Toggle */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all text-xs"
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
        </button>
      </div>

      {/* Target, Break and Foul Banners */}
      <div className="flex items-center justify-center gap-3">
        {/* Authoritative Target Ball Indicator */}
        <div className={`px-4 py-1.5 rounded-full font-black text-xs shadow-lg uppercase tracking-wider flex items-center gap-1.5 ${targetBadge.bg}`}>
          <span>🎯 TARGET:</span>
          <span>{targetBadge.text}</span>
        </div>

        {/* Current Break Counter */}
        {currentBreak > 0 && (
          <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 font-black text-xs shadow-lg uppercase tracking-wider flex items-center gap-1 animate-pulse">
            <Flame className="w-3.5 h-3.5 fill-current" />
            <span>BREAK: {currentBreak}</span>
          </div>
        )}

        {/* Reds Remaining Pill */}
        <div className="px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-slate-300 font-bold text-xs shadow-md">
          🔴 {redsRemaining} Reds Left
        </div>

        {/* In-hand / Free Ball Alerts */}
        {cueBallInHand && (
          <div className="px-4 py-1.5 rounded-full bg-sky-500/90 text-white font-black text-xs shadow-lg uppercase tracking-wider flex items-center gap-1.5 animate-bounce">
            <Sparkles className="w-3.5 h-3.5" /> BALL IN HAND (IN THE 'D')
          </div>
        )}
        {freeBallAvailable && (
          <div className="px-4 py-1.5 rounded-full bg-purple-500/90 text-white font-black text-xs shadow-lg uppercase tracking-wider">
            FREE BALL AVAILABLE
          </div>
        )}
        {lastFoul && (
          <div className="px-4 py-1.5 rounded-full bg-rose-500/90 text-white font-bold text-xs shadow-lg flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> FOUL: {lastFoul} (+{foulPoints} PTS)
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
  const colors: { type: SnookerBallType; label: string; bg: string; pts: number }[] = [
    { type: "yellow", label: "Yellow", bg: "bg-yellow-500 text-slate-950", pts: 2 },
    { type: "green", label: "Green", bg: "bg-emerald-600 text-white", pts: 3 },
    { type: "brown", label: "Brown", bg: "bg-amber-800 text-white", pts: 4 },
    { type: "blue", label: "Blue", bg: "bg-blue-600 text-white", pts: 5 },
    { type: "pink", label: "Pink", bg: "bg-pink-500 text-white", pts: 6 },
    { type: "black", label: "Black", bg: "bg-zinc-950 border border-zinc-700 text-white", pts: 7 },
  ];

  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl p-4 shadow-2xl flex flex-col items-center gap-3 animate-in fade-in zoom-in-95">
      <div className="text-xs font-black tracking-wider uppercase text-slate-300 flex items-center gap-1.5">
        <Sparkles className="w-4 h-4 text-amber-400" />
        {isFreeBall ? "Nominate Free Ball" : "Nominate Target Color"}
      </div>
      <div className="flex gap-2">
        {colors.map((c) => (
          <button
            key={c.type}
            onClick={() => onSelectColor(c.type)}
            className={`px-3 py-2 rounded-xl font-black text-xs shadow-md transition-all transform hover:scale-105 flex items-center gap-1.5 cursor-pointer ${
              c.bg
            } ${nominatedColor === c.type ? "ring-2 ring-white ring-offset-2 ring-offset-slate-900" : "opacity-90 hover:opacity-100"}`}
          >
            <span>{c.label}</span>
            <span className="text-[10px] opacity-80">({c.pts})</span>
            {nominatedColor === c.type && <Check className="w-3.5 h-3.5" />}
          </button>
        ))}
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
    <div className="flex flex-col items-center bg-slate-900/90 backdrop-blur-md border border-slate-800 p-3 rounded-2xl shadow-xl select-none">
      <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2">
        POWER
      </span>
      <div className="relative h-44 w-6 bg-slate-950 rounded-full p-1 border border-slate-800 flex flex-col justify-end overflow-hidden">
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
      <span className="text-[11px] font-mono font-bold text-slate-200 mt-2">
        {Math.round(power * 100)}%
      </span>
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

  return (
    <div className="flex flex-col items-center bg-slate-900/90 backdrop-blur-md border border-slate-800 p-3 rounded-2xl shadow-xl select-none">
      <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2">
        SPIN / ENGLISH
      </span>
      <div
        onClick={handleBallClick}
        className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-slate-200 to-white shadow-inner border border-slate-300 cursor-crosshair flex items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-x-0 top-1/2 h-px bg-slate-400/40" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-400/40" />
        <div
          className="absolute w-3.5 h-3.5 rounded-full bg-sky-500 border border-white shadow-md transform -translate-x-1/2 -translate-y-1/2 transition-all"
          style={{
            left: `${((spinX + 1) / 2) * 100}%`,
            top: `${((spinY + 1) / 2) * 100}%`,
          }}
        />
      </div>
      <button
        onClick={() => setSpin(0, 0)}
        className="text-[10px] text-slate-400 hover:text-white mt-1.5 transition-colors underline"
      >
        Reset
      </button>
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
