/**
 * ChessMatchPanel — Premium In-Game Chess HUD
 *
 * Layout (top-to-bottom):
 *   ┌─ Match header (title + connection badge + sound toggle) ───┐
 *   │  Opponent card (avatar + name + color + captured pieces)   │
 *   │  Opponent clock (digital, large mono)                      │
 *   │  Turn indicator pill (animated)                            │
 *   │  Evaluation bar + advantage label                          │
 *   │  Move history table (scrollable)                           │
 *   │  My clock (digital, large mono)                            │
 *   │  My player card (avatar + name + color + captured pieces)  │
 *   └─ Controls (Draw / Resign / Sound) ──────────────────────────┘
 */
import { useEffect, useRef, useState } from "react";
import {
  Trophy,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Cpu,
} from "lucide-react";
import type { ChessRemoteState } from "../phaser/managers/ChessMultiplayerDriver";
import { useMultiplayerStore } from "../../../store/multiplayerStore";
import {
  liveRemainingMs,
  formatClock,
  fenAtPly,
  materialEval,
  buildPgn,
} from "../utils/chessReactUtils";
import { ChessEvents } from "../phaser/events/ChessEvents";
import type { PieceType } from "../phaser/types/chess.types";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChessMatchPanelProps {
  game?: Phaser.Game | null;
}

const PIECE_GLYPHS: Record<PieceType, string> = {
  p: "♟", r: "♜", n: "♞", b: "♝", q: "♛", k: "♚",
};

const PIECE_VALUES: Record<PieceType, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
};

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Large digital clock display */
function DigitalClock({ ms, active }: { ms: number; active: boolean }) {
  const isLow      = ms < 10_000;
  const isCritical = ms < 5_000;
  const hasTime    = ms < Infinity;

  if (!hasTime) return null;

  return (
    <div
      className={`
        flex items-center justify-center
        font-mono font-black tabular-nums tracking-widest
        rounded-xl border px-4 py-2 text-xl
        transition-all duration-300
        ${isCritical
          ? "bg-rose-950/70 border-rose-500 text-rose-300 shadow-[0_0_16px_rgba(244,63,94,0.4)] animate-pulse"
          : isLow
            ? "bg-amber-950/60 border-amber-500/70 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
            : active
              ? "bg-slate-800/80 border-amber-500/50 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.12)]"
              : "bg-slate-900/60 border-slate-700/60 text-slate-500"
        }
      `}
    >
      {formatClock(ms)}
    </div>
  );
}

/** Compact player card (avatar icon + name + color badge) */
function PlayerCard({
  name,
  colorIcon,
  colorLabel,
  captures,
  materialScore,
  isActive,
  isMe,
}: {
  name: string;
  colorIcon: string;
  colorLabel: string;
  captures: PieceType[];
  materialScore: number;
  isActive: boolean;
  isMe: boolean;
}) {
  return (
    <div
      className={`
        relative flex items-center gap-3 px-3 py-2.5 rounded-2xl border transition-all duration-300
        ${isActive
          ? isMe
            ? "bg-slate-800/80 border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.14)]"
            : "bg-slate-800/80 border-sky-500/60 shadow-[0_0_20px_rgba(56,189,248,0.14)]"
          : "bg-slate-900/60 border-slate-800/80"
        }
      `}
    >
      {/* Color icon avatar */}
      <div
        className={`
          w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold flex-shrink-0 border
          ${colorLabel === "White"
            ? "bg-gradient-to-br from-amber-50 to-amber-100 text-slate-900 border-amber-200/70 shadow-md"
            : "bg-gradient-to-br from-slate-900 to-slate-950 text-amber-300 border-slate-700 shadow-md"
          }
        `}
      >
        {colorIcon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-black text-white text-sm leading-tight truncate">{name}</p>
        <p className={`text-[10px] font-bold uppercase tracking-widest leading-tight mt-0.5 ${isMe ? "text-amber-400/70" : "text-sky-400/70"}`}>
          {colorLabel} Pieces
        </p>
        {/* Captured pieces tray */}
        {captures.length > 0 && (
          <div className="flex flex-wrap items-center gap-0.5 mt-1">
            {captures.map((p, i) => (
              <span key={i} className="text-[11px] leading-none text-slate-400">{PIECE_GLYPHS[p]}</span>
            ))}
            {materialScore > 0 && (
              <span className="ml-1 text-[10px] font-black text-emerald-400">+{materialScore}</span>
            )}
          </div>
        )}
      </div>

      {/* Active indicator */}
      {isActive && (
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isMe ? "bg-amber-400 animate-pulse" : "bg-sky-400 animate-pulse"}`} />
      )}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function ChessMatchPanel({ game }: ChessMatchPanelProps) {
  const gameState     = useMultiplayerStore((s) => s.gameState) as unknown as ChessRemoteState | null;
  const room          = useMultiplayerStore((s) => s.room);
  const mySeat        = useMultiplayerStore((s) => s.mySeat);
  const sendGameAction = useMultiplayerStore((s) => s.sendGameAction);
  const socketStatus  = useMultiplayerStore((s) => s.status);

  const [localStatus,   setLocalStatus]   = useState<string>("WHITE'S TURN");
  const [localCaptures, setLocalCaptures] = useState<{ w: PieceType[]; b: PieceType[] }>({ w: [], b: [] });
  const [isMuted,       setIsMuted]       = useState(false);
  const [tick,          setTick]          = useState(Date.now());
  const moveHistoryRef = useRef<HTMLDivElement>(null);

  // Clock tick (100ms)
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  // Scene event bridge (offline / AI)
  useEffect(() => {
    if (!game) return;
    const id = setInterval(() => {
      const scene = game.scene.getScene("ChessScene");
      if (!scene) return;
      clearInterval(id);
      scene.events.on("chess:hud-status",   (s: string)                          => setLocalStatus(s.toUpperCase()));
      scene.events.on("chess:hud-captures", (c: { w: PieceType[]; b: PieceType[] }) => setLocalCaptures(c));
    }, 100);
    return () => clearInterval(id);
  }, [game]);

  // Auto-scroll move history to latest
  useEffect(() => {
    if (moveHistoryRef.current) {
      moveHistoryRef.current.scrollTop = moveHistoryRef.current.scrollHeight;
    }
  });

  // ── Resolve state ──────────────────────────────────────────────────────────
  const s        = gameState;
  const isOnline = !!s;
  const mode     = (game?.registry.get("mode") as "ai" | "pvp") ?? "ai";
  const aiLevel  = (game?.registry.get("aiLevel") as number)    ?? 2;

  const players    = s?.players ?? [];
  const myIdx      = players.findIndex((p) => p.seat === mySeat);
  const oppIdx     = myIdx === 0 ? 1 : 0;
  const opponent   = players[oppIdx]  ?? { seat: oppIdx,       color: oppIdx === 0 ? "w" : "b" };
  const myPlayer   = players[myIdx]   ?? { seat: mySeat ?? 0,  color: mySeat === 0 ? "w" : "b" };

  const oppName = isOnline
    ? room?.players?.find((p) => p.seat === opponent.seat)?.displayName || `Player ${(opponent.seat ?? 0) + 1}`
    : mode === "ai" ? `StockAI (Lv${aiLevel})` : "Player 2";
  const myName  = isOnline
    ? room?.players?.find((p) => p.seat === myPlayer.seat)?.displayName || "You"
    : "Player 1";

  const clocks       = s?.clocks;
  const timeControl  = s?.timeControl;
  const myKey        = String(myPlayer.seat);
  const oppKey       = String(opponent.seat);
  const myMs         = clocks?.[myKey]  ? liveRemainingMs(clocks[myKey]!,  tick) : Infinity;
  const oppMs        = clocks?.[oppKey] ? liveRemainingMs(clocks[oppKey]!, tick) : Infinity;

  const isMySeatTurn  = isOnline ? s?.currentSeat === mySeat          : localStatus.includes("WHITE");
  const isOppTurn     = isOnline ? s?.currentSeat === opponent.seat    : localStatus.includes("BLACK");

  const drawOfferedByMe = s?.drawOfferedBy === mySeat;
  const canAcceptDraw   = s?.drawOfferedBy != null && s?.drawOfferedBy !== mySeat;

  // Material advantage (positive = my advantage)
  const myEval = s?.fen ? materialEval(s.fen) : 0;

  // Captured pieces from local captures or server history
  const myCaptures  = localCaptures.b; // I captured black pieces
  const oppCaptures = localCaptures.w; // opponent captured white pieces
  const myCaptureScore  = myCaptures.reduce((a, p)  => a + PIECE_VALUES[p],  0);
  const oppCaptureScore = oppCaptures.reduce((a, p) => a + PIECE_VALUES[p], 0);

  // Move history pairs
  const movePairs: Array<{ num: number; white: string; black?: string }> = [];
  if (s?.history) {
    for (let i = 0; i < s.history.length; i += 2) {
      const wRaw = s.history[i];
      const bRaw = s.history[i + 1];
      const w    = typeof wRaw === "string" ? wRaw : (wRaw as any)?.san ?? "";
      const b    = typeof bRaw === "string" ? bRaw : (bRaw as any)?.san;
      movePairs.push({ num: Math.floor(i / 2) + 1, white: w, black: b });
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleResign = () => {
    if (isOnline) sendGameAction?.({ type: "resign" });
    else {
      const scene = game?.scene?.getScene("ChessScene");
      if (scene) scene.events.emit(ChessEvents.GAME_OVER, "Game Over - Resigned");
    }
  };
  const handleOfferDraw   = () => sendGameAction?.({ type: "draw-offer" });
  const handleAcceptDraw  = () => sendGameAction?.({ type: "draw-accept" });
  const handleDeclineDraw = () => sendGameAction?.({ type: "draw-decline" });
  const toggleSound = () => {
    const scene = game?.scene?.getScene("ChessScene");
    if (scene) { scene.sound.mute = !scene.sound.mute; setIsMuted(scene.sound.mute); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="
      w-full flex flex-col gap-3 p-4
      bg-[#0b0f1a]/95 backdrop-blur-2xl
      border border-slate-800/80
      rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7)]
      text-xs select-none
    ">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-white font-black text-[11px] tracking-widest uppercase">Chess Master</span>
          </div>
          <p className="text-[10px] text-slate-500 font-bold tracking-wider uppercase mt-0.5">
            {isOnline ? "Rated Match" : mode === "ai" ? `PvE · AI Level ${aiLevel}` : "Pass & Play"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sound toggle */}
          <button
            onClick={toggleSound}
            className="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center border border-slate-700/60 transition-colors"
          >
            {isMuted
              ? <VolumeX className="w-3.5 h-3.5 text-rose-400" />
              : <Volume2 className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          {/* Connection status */}
          {isOnline ? (
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border ${
              socketStatus === "connected"
                ? "bg-emerald-950/60 text-emerald-400 border-emerald-700/50"
                : "bg-rose-950/60 text-rose-400 border-rose-700/50 animate-pulse"
            }`}>
              {socketStatus === "connected" ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{socketStatus === "connected" ? "LIVE" : "RECONNECT"}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-950/50 text-amber-400 border border-amber-800/40">
              <Cpu className="w-3 h-3" />
              <span>LOCAL</span>
            </div>
          )}
        </div>
      </div>

      {/* ── SEPARATOR ── */}
      <div className="h-px bg-slate-800/80" />

      {/* ── OPPONENT CARD ── */}
      <PlayerCard
        name={oppName}
        colorIcon={opponent.color === "w" ? "♔" : "♚"}
        colorLabel={opponent.color === "w" ? "White" : "Black"}
        captures={oppCaptures}
        materialScore={oppCaptureScore > myCaptureScore ? oppCaptureScore - myCaptureScore : 0}
        isActive={isOppTurn}
        isMe={false}
      />

      {/* ── OPPONENT CLOCK ── */}
      <DigitalClock ms={oppMs} active={isOppTurn} />

      {/* ── TURN INDICATOR ── */}
      <div className={`
        flex items-center justify-center gap-2 py-2 px-3 rounded-xl border
        transition-all duration-500
        ${isMySeatTurn
          ? "bg-amber-950/40 border-amber-500/40 text-amber-300"
          : "bg-sky-950/30 border-sky-700/30 text-sky-400"
        }
      `}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isMySeatTurn ? "bg-amber-400 animate-ping" : "bg-sky-400"}`} />
        <span className="font-black text-[11px] tracking-widest uppercase">
          {isMySeatTurn ? "Your Turn" : "Opponent's Turn"}
        </span>
      </div>

      {/* ── EVALUATION BAR ── */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          <span>{myPlayer.color === "w" ? "White" : "Black"}</span>
          <span className={`${myEval > 0 ? "text-amber-400" : myEval < 0 ? "text-sky-400" : "text-slate-500"}`}>
            {myEval > 0 ? `+${myEval}` : myEval < 0 ? `${myEval}` : "="}
          </span>
          <span>{opponent.color === "w" ? "White" : "Black"}</span>
        </div>
        <div className="relative h-2 w-full bg-slate-800 rounded-full overflow-hidden">
          {/* White advantage bar */}
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-amber-300 to-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(5, 50 + myEval * 4.5))}%` }}
          />
        </div>
      </div>

      {/* ── MOVE HISTORY TABLE ── */}
      <div className="flex flex-col bg-slate-950/60 rounded-2xl border border-slate-800/60 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/60">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Move History</span>
          <span className="text-[10px] font-bold text-slate-600">{movePairs.length}</span>
        </div>

        <div
          ref={moveHistoryRef}
          className="overflow-y-auto max-h-[160px] min-h-[80px] scrollbar-thin scrollbar-thumb-slate-700/50"
        >
          {movePairs.length === 0 ? (
            <p className="text-slate-600 text-center py-5 italic text-[11px]">No moves yet</p>
          ) : (
            <div className="font-mono text-[11px]">
              {movePairs.map((pair, idx) => {
                const isLatest = idx === movePairs.length - 1;
                return (
                  <div
                    key={pair.num}
                    className={`flex items-center px-3 py-1.5 ${
                      isLatest
                        ? "bg-amber-500/10 text-amber-200"
                        : idx % 2 === 0
                          ? "bg-transparent text-slate-300"
                          : "bg-slate-900/40 text-slate-300"
                    }`}
                  >
                    <span className="w-7 text-slate-600 font-bold">{pair.num}.</span>
                    <span className={`flex-1 font-bold ${isLatest ? "text-amber-300" : ""}`}>{pair.white}</span>
                    <span className={`flex-1 ${isLatest && pair.black ? "text-amber-300 font-bold" : ""}`}>
                      {pair.black ?? ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── MY CLOCK ── */}
      <DigitalClock ms={myMs} active={isMySeatTurn} />

      {/* ── MY PLAYER CARD ── */}
      <PlayerCard
        name={myName}
        colorIcon={myPlayer.color === "w" ? "♔" : "♚"}
        colorLabel={myPlayer.color === "w" ? "White" : "Black"}
        captures={myCaptures}
        materialScore={myCaptureScore > oppCaptureScore ? myCaptureScore - oppCaptureScore : 0}
        isActive={isMySeatTurn}
        isMe={true}
      />

      {/* ── SEPARATOR ── */}
      <div className="h-px bg-slate-800/80" />

      {/* ── MATCH CONTROLS ── */}
      <div className="flex gap-2">
        {isOnline && canAcceptDraw ? (
          <>
            <button
              onClick={handleAcceptDraw}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.02] active:scale-[0.97]"
            >
              Accept Draw
            </button>
            <button
              onClick={handleDeclineDraw}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px] uppercase tracking-wider border border-slate-700 transition-colors"
            >
              Decline
            </button>
          </>
        ) : isOnline && drawOfferedByMe ? (
          <button disabled className="flex-1 py-2.5 rounded-xl bg-amber-500/10 text-amber-400 font-bold text-[11px] border border-amber-500/30 cursor-not-allowed uppercase tracking-wider">
            Draw Offered…
          </button>
        ) : isOnline ? (
          <button
            onClick={handleOfferDraw}
            disabled={s?.drawOfferedBy != null}
            className="flex-1 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-amber-400 border border-slate-700 hover:border-amber-500/40 font-black text-[11px] uppercase tracking-wider transition-all disabled:opacity-40"
          >
            Offer Draw
          </button>
        ) : null}

        <button
          onClick={handleResign}
          className="flex-1 py-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 text-rose-400 border border-rose-900/60 hover:border-rose-500/50 font-black text-[11px] uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.97]"
        >
          Resign
        </button>
      </div>
    </div>
  );
}

export default ChessMatchPanel;
