import { useEffect, useState } from "react";
import {
  Flag
} from "lucide-react";
import type {
  ChessTimeControlConfig,
  MatchSettings
} from "@gaming-hub/shared";
import type { ChessRemoteState } from "../phaser/managers/ChessMultiplayerDriver";
import { useMultiplayerStore } from "../../../store/multiplayerStore";
import {
  liveRemainingMs,
  formatClock,
  fenAtPly,
  materialEval,
  buildPgn,
  isUntimed,
} from "../utils/chessReactUtils";
import { ChessEvents } from "../phaser/events/ChessEvents";

interface ChessMatchPanelProps {
  game?: Phaser.Game | null;
}

export function ChessMatchPanel({ game }: ChessMatchPanelProps) {
  const gameState = useMultiplayerStore((s) => s.gameState) as unknown as ChessRemoteState | null;
  const renderKey = useMultiplayerStore((s) => s.renderKey); // Force re-render on state changes
  
  console.log("[ChessMatchPanel] Render called, renderKey:", renderKey, "gameState exists:", !!gameState, "FEN:", gameState?.fen?.substring(0, 20) + "...");
  
  const lastEvents = useMultiplayerStore((s) => s.lastEvents);
  const winner = useMultiplayerStore((s) => s.winner);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const sendGameAction = useMultiplayerStore((s) => s.sendGameAction);
  const socketStatus = useMultiplayerStore((s) => s.status);

  // Clock ticker
  const [tick, setTick] = useState({ now: Date.now() });
  useEffect(() => {
    const interval = setInterval(() => {
      setTick({ now: Date.now() });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const s = gameState;
  if (!s) return null;

  const players = s.players ?? [];
  const myIdx = players.findIndex((p) => p.seat === mySeat);
  const opponentIdx = myIdx === 0 ? 1 : 0;
  const opponent = players[opponentIdx] ?? { seat: opponentIdx, color: opponentIdx === 0 ? "w" : "b" };
  const myPlayer = players[myIdx] ?? { seat: mySeat ?? 0, color: mySeat === 0 ? "w" : "b" };
  const timeControl = s.timeControl;
  const clocks = s.clocks;
  const isMyTurn = s.currentSeat === mySeat;
  // Draw offers should be available anytime, not just on your turn (standard chess behavior)
  const canMakeMoves = !s.finished && isMyTurn && socketStatus === "connected";
  const canOfferDraw = !s.finished && socketStatus === "connected"; // Allow draw offers anytime
  const canInteract = canMakeMoves; // For moving pieces only
  const drawOfferedByMe = s.drawOfferedBy === mySeat;
  const canAcceptDraw = s.drawOfferedBy != null && s.drawOfferedBy !== mySeat;

  // Clock values
  const myClockKey = myPlayer.seat.toString();
  const oppClockKey = opponent.seat.toString();
  const myClock = clocks?.[myClockKey];
  const oppClock = clocks?.[oppClockKey];
  const myRemainingMs = myClock ? liveRemainingMs(myClock, tick.now) : Infinity;
  const oppRemainingMs = oppClock ? liveRemainingMs(oppClock, tick.now) : Infinity;

  // Material and PGN
  const myEval = s.fen ? materialEval(s.fen) : 0;
  const pgn = s.history ? buildPgn(s.history) : "";

  // Replay state
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  const replayFen = replayIdx != null && s.fen ? fenAtPly(s.fen, s.history ?? [], replayIdx) : null;

  const handleResign = () => sendGameAction && sendGameAction({ type: "resign" });
  const handleOfferDraw = () => sendGameAction && sendGameAction({ type: "draw-offer" });
  const handleAcceptDraw = () => sendGameAction && sendGameAction({ type: "draw-accept" });
  const handleDeclineDraw = () => sendGameAction && sendGameAction({ type: "draw-decline" });

  const enterReplay = (idx: number) => setReplayIdx(idx);
  const exitReplay = () => {
    setReplayIdx(null);
  };

  useEffect(() => {
    const scene = game?.scene?.getScene("ChessScene");
    if (!scene) return;

    if (replayFen && replayIdx !== null) {
      scene.events.emit(ChessEvents.REPLAY_FEN, replayFen);
    } else {
      scene.events.emit(ChessEvents.REPLAY_EXIT);
    }
  }, [game, replayFen, replayIdx]);

  const getWinnerDisplay = () => {
    if (!s.finished) return null;
    if (!s.winnerSeats || s.winnerSeats.length === 0) return <div className="text-center text-slate-600 dark:text-slate-400 text-[10px] uppercase font-bold tracking-wider">Draw</div>;
    if (s.winnerSeats.includes(mySeat ?? 0)) {
      return <div className="text-center text-emerald-600 dark:text-emerald-400 text-[10px] uppercase font-bold tracking-wider">You Win!</div>;
    }
    return <div className="text-center text-rose-600 dark:text-rose-400 text-[10px] uppercase font-bold tracking-wider">You Lose</div>;
  };

  const getEndReasonDisplay = () => {
    if (!s.finished || !s.endReason) return null;
    const reasonMap: Record<string, string> = {
      "checkmate": "By checkmate",
      "stalemate": "By stalemate",
      "insufficient": "Insufficient material",
      "repetition": "Threefold repetition",
      "fifty-move": "Fifty-move rule",
      "resign": "By resignation",
      "flag": "Time forfeit",
      "agreement": "By agreement"
    };
    return <div className="text-center text-[10px] text-slate-500 dark:text-slate-500">{reasonMap[s.endReason] || ""}</div>;
  };

  return (
    <div className="w-72 space-y-3 text-xs pointer-events-none select-none">
      {/* Player cards and clocks */}
      {players.map((player) => (
        <div
          key={player.seat}
          className={`flex items-center gap-2 p-2 rounded-xl border-2 transition-all pointer-events-auto ${
            player.seat === mySeat
              ? "bg-indigo-50 border-indigo-500 shadow-sm"
              : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
          }`}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold ${
            player.color === "w" ? "border-2 border-white" : "border-2 border-slate-900 dark:border-white"
          }`}>
            {player.color === "w" ? "♔" : "♚"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{player.seat === mySeat ? "You" :`P${player.seat + 1}`}</p>
            {timeControl && s.finished === false && (clocks?.[player.seat]?.startedAtMs != null) && (
              <p
                className="font-mono text-[10px] opacity-80"
                style={{ color: liveRemainingMs(clocks[player.seat], tick.now) < 10000 ? "#f87171" : undefined }}
              >
                {formatClock(liveRemainingMs(clocks[player.seat], tick.now))}
              </p>
            )}
          </div>
        </div>
      ))}

      {/* Material evaluation bar */}
      {!s.finished && (
        <div className="relative h-1 bg-slate-200 dark:bg-slate-700 mt-2">
          {myEval !== 0 && (
            <div
              className={`absolute top-0 left-1/2 w-1/2 h-full transition-all ${myEval > 0 ? "bg-indigo-400" : "bg-amber-400"}`}
              style={{
                width: `${Math.min(100, Math.abs(myEval) / 10)}%`,
                marginLeft: myEval > 0 ? 0 : "auto",
                marginRight: myEval < 0 ? 0 : "auto"
              }}
            />
          )}
          <div className="absolute left-1/2 top-0 -translate-x-1/2 w-0.5 h-3 bg-slate-400" />
        </div>
      )}

      {!s.finished && socketStatus === "connected" && (
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700 pointer-events-auto">
          <p className="font-bold text-slate-800 dark:text-slate-200">Actions</p>
          <div className="flex flex-wrap gap-2">
            {canAcceptDraw ? (
              <>
                <button
                  onClick={handleAcceptDraw}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition-all shadow-md shadow-emerald-600/20"
                >
                  Accept Draw
                </button>
                <button
                  onClick={handleDeclineDraw}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-bold transition-colors"
                >
                  Decline
                </button>
              </>
            ) : drawOfferedByMe ? (
              <button
                disabled
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-amber-500/30 text-amber-300 text-[10px] font-bold border border-amber-500/30 cursor-not-allowed"
              >
                Draw Offered...
              </button>
            ) : (
              <button
                onClick={handleOfferDraw}
                disabled={s.drawOfferedBy != null}
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white disabled:opacity-40 text-[10px] font-bold transition-colors shadow-sm"
              >
                Draw?
              </button>
            )}
            <button
              onClick={handleResign}
              disabled={s.drawOfferedBy != null}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-40 text-[10px] font-bold transition-colors shadow-sm"
            >
              Resign
            </button>
          </div>
        </div>
      )}

      {s.finished && winner && (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 pointer-events-auto">
          {getWinnerDisplay()}
          {getEndReasonDisplay()}
        </div>
      )}

      {pgn && !replayFen && (
        <div className="max-h-40 overflow-y-auto space-y-1 pt-2 border-t border-slate-200 dark:border-slate-700 pointer-events-auto">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400">
            <span>Move History</span>
            <button
              onClick={() => setReplayIdx(pgn.trim().split(/\s+/).length - 1)}
              className="hover:text-indigo-400 transition-colors"
            >
              Replay
            </button>
          </div>
          <div className="break-all font-mono text-[10px] text-slate-600 dark:text-slate-300">
            {pgn}
          </div>
        </div>
      )}

      {replayFen && replayIdx != null && (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 pointer-events-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Replay</span>
            <button onClick={exitReplay} className="text-[10px] hover:text-indigo-400">
              Exit
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1 max-h-32 overflow-y-auto">
            {pgn.trim().split(/\s+/).map((san, idx) => (
              <button
                key={idx}
                onClick={() => enterReplay(idx)}
                className={`py-1 rounded text-[10px] font-mono border transition-all ${
                  idx === replayIdx
                    ? "bg-indigo-200 dark:bg-indigo-900/30 border-indigo-500 text-indigo-700"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-center text-slate-400 mt-1">
            Showing move {replayIdx + 1}
          </p>
        </div>
      )}
    </div>
  );
}
