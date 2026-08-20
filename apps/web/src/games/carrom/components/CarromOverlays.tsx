import React from "react";
import { Crown, Sparkles, Clock, RefreshCw, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { WinnerInfo } from "../../../store/multiplayerStore";

interface PlayerInfo {
  name: string;
  isWhite: boolean;
  score: number;
  remainingCoins: number;
  isYou: boolean;
}

interface CarromHUDProps {
  player0: PlayerInfo;
  player1: PlayerInfo;
  isMyTurn: boolean;
  isTurnActive: boolean;
  turnSecondsRemaining: number | null;
  queenState: "in_play" | "held" | "covered";
  queenHolderSeat: number | null;
  mySeat: number;
  onPlaceStriker?: (val: number) => void;
  strikerPos: number;
  isPlacingStriker: boolean;
  isStrikerBlocked: boolean;
}

export const CarromHUD: React.FC<CarromHUDProps> = ({
  player0,
  player1,
  isMyTurn,
  isTurnActive,
  turnSecondsRemaining,
  queenState,
  queenHolderSeat,
  mySeat,
  onPlaceStriker,
  strikerPos,
  isPlacingStriker,
  isStrikerBlocked,
}) => {
  const isWarning = turnSecondsRemaining !== null && turnSecondsRemaining <= 10;
  const isDanger = turnSecondsRemaining !== null && turnSecondsRemaining <= 5;

  const myPlayer = mySeat === 0 ? player0 : player1;
  const oppPlayer = mySeat === 0 ? player1 : player0;

  return (
    <div className="w-full flex flex-col items-center gap-3">
      {/* ── Top Tournament Player HUD Bar ── */}
      <div className="w-full max-w-[480px] grid grid-cols-2 gap-2 bg-slate-900/80 backdrop-blur-md p-2.5 rounded-2xl border border-slate-700/60 shadow-xl">
        {/* You Card */}
        <div
          className={`flex items-center gap-2 p-2 rounded-xl border transition-all duration-300 ${
            isMyTurn
              ? "bg-sky-950/60 border-sky-500/80 shadow-[0_0_15px_rgba(56,189,248,0.25)]"
              : "bg-slate-800/40 border-slate-700/40"
          }`}
        >
          <div className="relative">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shadow-inner ${
                myPlayer.isWhite
                  ? "bg-amber-100 text-amber-950 border border-amber-300"
                  : "bg-slate-800 text-slate-200 border border-slate-600"
              }`}
            >
              {myPlayer.name.slice(0, 2).toUpperCase()}
            </div>
            {isMyTurn && (
              <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white truncate">{myPlayer.name} (You)</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-700/70 text-slate-300">
                {myPlayer.isWhite ? "⚪ White" : "⚫ Black"}
              </span>
            </div>
            {/* Remaining Coin Pills */}
            <div className="flex items-center gap-1 mt-1">
              {Array.from({ length: 9 }).map((_, idx) => (
                <div
                  key={idx}
                  className={`w-2 h-2 rounded-full transition-all ${
                    idx < myPlayer.remainingCoins
                      ? myPlayer.isWhite
                        ? "bg-amber-200 shadow-[0_0_4px_rgba(253,230,138,0.8)]"
                        : "bg-slate-400 shadow-[0_0_4px_rgba(148,163,184,0.6)]"
                      : "bg-slate-800/80 border border-slate-700/50"
                  }`}
                />
              ))}
              <span className="text-[10px] font-bold text-amber-400 ml-1">
                {myPlayer.remainingCoins}
              </span>
            </div>
          </div>
        </div>

        {/* Opponent Card */}
        <div
          className={`flex items-center gap-2 p-2 rounded-xl border transition-all duration-300 ${
            !isMyTurn
              ? "bg-rose-950/40 border-rose-500/70 shadow-[0_0_15px_rgba(244,63,94,0.2)]"
              : "bg-slate-800/40 border-slate-700/40"
          }`}
        >
          <div className="relative">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shadow-inner ${
                oppPlayer.isWhite
                  ? "bg-amber-100 text-amber-950 border border-amber-300"
                  : "bg-slate-800 text-slate-200 border border-slate-600"
              }`}
            >
              {oppPlayer.name.slice(0, 2).toUpperCase()}
            </div>
            {!isMyTurn && (
              <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 truncate">{oppPlayer.name}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-700/70 text-slate-300">
                {oppPlayer.isWhite ? "⚪ White" : "⚫ Black"}
              </span>
            </div>
            {/* Remaining Coin Pills */}
            <div className="flex items-center gap-1 mt-1">
              {Array.from({ length: 9 }).map((_, idx) => (
                <div
                  key={idx}
                  className={`w-2 h-2 rounded-full transition-all ${
                    idx < oppPlayer.remainingCoins
                      ? oppPlayer.isWhite
                        ? "bg-amber-200 shadow-[0_0_4px_rgba(253,230,138,0.8)]"
                        : "bg-slate-400 shadow-[0_0_4px_rgba(148,163,184,0.6)]"
                      : "bg-slate-800/80 border border-slate-700/50"
                  }`}
                />
              ))}
              <span className="text-[10px] font-bold text-rose-400 ml-1">
                {oppPlayer.remainingCoins}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Status & Queen Badge Bar ── */}
      <div className="w-full max-w-[480px] flex items-center justify-between px-3 py-1.5 bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-800">
        {/* Turn Status */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isMyTurn
                ? "bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse"
                : "bg-slate-500"
            }`}
          />
          <span className="text-xs font-bold tracking-wide text-slate-200">
            {isTurnActive
              ? "SHOT IN MOTION..."
              : isMyTurn
              ? isStrikerBlocked
                ? "MOVE STRIKER (BLOCKED)"
                : "YOUR TURN — AIM & STRIKE"
              : `${oppPlayer.name.toUpperCase()}'S TURN`}
          </span>
        </div>

        {/* Queen Status Pill */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60">
          <Crown className={`w-3.5 h-3.5 ${queenState === "covered" ? "text-amber-400" : "text-rose-400"}`} />
          <span className="text-[10px] font-bold text-slate-300">
            {queenState === "covered"
              ? `QUEEN COVERED (${queenHolderSeat === mySeat ? "YOU" : "OPPONENT"})`
              : queenState === "held"
              ? "COVER NEEDED!"
              : "QUEEN IN PLAY"}
          </span>
        </div>

        {/* Turn Timer Badge */}
        {turnSecondsRemaining !== null && (
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-xs font-bold transition-all ${
              isDanger
                ? "bg-rose-500/20 text-rose-400 border border-rose-500/60 animate-bounce"
                : isWarning
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-slate-800 text-slate-300 border border-slate-700"
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>{turnSecondsRemaining}s</span>
          </div>
        )}
      </div>

      {/* ── Striker Placement Slider Bar ── */}
      {isMyTurn && !isTurnActive && onPlaceStriker && (
        <div className="w-full max-w-[480px] flex items-center gap-3 px-3 py-2 bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-700/60">
          <span className="text-[11px] font-bold text-slate-400 shrink-0">STRIKER POS:</span>
          <input
            type="range"
            min={-142.5}
            max={142.5}
            value={strikerPos}
            onChange={(e) => onPlaceStriker(Number(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-slate-100"
          />
          {isStrikerBlocked && (
            <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1 shrink-0 animate-pulse">
              <AlertTriangle className="w-3 h-3" /> OVERLAP
            </span>
          )}
        </div>
      )}
    </div>
  );
};

interface GameOverModalProps {
  winner: WinnerInfo | null;
  mySeat: number;
  playerNames: string[];
  whiteScore: number;
  blackScore: number;
  rematchState: "idle" | "requested" | "received";
  onRequestRematch: () => void;
  onAcceptRematch: () => void;
  onLeaveRoom: () => void;
}

export const CarromGameOverModal: React.FC<GameOverModalProps> = ({
  winner,
  mySeat,
  playerNames,
  whiteScore,
  blackScore,
  rematchState,
  onRequestRematch,
  onAcceptRematch,
  onLeaveRoom,
}) => {
  const isWin = winner ? winner.winnerSeats?.includes(mySeat) : false;
  const isDraw = winner ? winner.winnerSeats?.length === 0 || winner.winnerSeats === undefined : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-sm bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-700 rounded-3xl p-6 shadow-2xl text-center">
        {/* Victory Icon / Banner */}
        <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 shadow-lg">
          {isWin ? <Crown className="w-9 h-9" /> : isDraw ? <Sparkles className="w-9 h-9" /> : <X className="w-9 h-9" />}
        </div>

        <h2 className="text-2xl font-black text-white tracking-wider">
          {isWin ? "VICTORY!" : isDraw ? "MATCH DRAW!" : "DEFEAT"}
        </h2>
        <p className="text-xs text-slate-400 mt-1 mb-5">
          {isWin
            ? "Outstanding performance! All target coins cleared."
            : isDraw
            ? "Well contested match! Points shared equally."
            : "Good effort! Practice and challenge again."}
        </p>

        {/* Scoreboard Card */}
        <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 mb-6 grid grid-cols-2 gap-3">
          <div className="text-left border-r border-slate-700/60 pr-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">
              {playerNames[0] || "Player 1"} (White)
            </span>
            <div className="text-2xl font-black text-amber-400 mt-0.5">{whiteScore} pts</div>
          </div>
          <div className="text-right pl-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">
              {playerNames[1] || "Player 2"} (Black)
            </span>
            <div className="text-2xl font-black text-slate-200 mt-0.5">{blackScore} pts</div>
          </div>
        </div>

        {/* Rematch & Exit Buttons */}
        <div className="flex flex-col gap-2.5">
          {rematchState === "received" ? (
            <button
              onClick={onAcceptRematch}
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" /> Accept Rematch!
            </button>
          ) : rematchState === "requested" ? (
            <button
              disabled
              className="w-full py-3 bg-slate-800 text-slate-400 font-bold text-sm rounded-xl border border-slate-700 flex items-center justify-center gap-2 cursor-not-allowed"
            >
              <RefreshCw className="w-4 h-4 animate-spin text-sky-400" /> Rematch Requested...
            </button>
          ) : (
            <button
              onClick={onRequestRematch}
              className="w-full py-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-black text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Request Rematch
            </button>
          )}

          <button
            onClick={onLeaveRoom}
            className="w-full py-2.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition-all"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    </div>
  );
};
