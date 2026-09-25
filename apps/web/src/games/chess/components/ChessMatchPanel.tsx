/**
 * ChessMatchPanel — Premium In-Game Chess HUD
 *
 * Provides modular components:
 *   - ChessDesktopSidebar (>= lg): Sleek right-hand match sidebar
 *   - ChessMobileTop (< lg): Compact opponent card + digital clock + sound toggle
 *   - ChessMobileBottom (< lg): Compact player card + clock + turn pill + action buttons + move modal
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  Trophy,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Cpu,
  ScrollText,
  X,
  Flag,
  Handshake,
  RefreshCcw,
} from "lucide-react";
import type { ChessRemoteState } from "../phaser/managers/ChessMultiplayerDriver";
import { useMultiplayerStore } from "../../../store/multiplayerStore";
import { useAuthStore } from "../../../store/authStore";
import {
  liveRemainingMs,
  formatClock,
  materialEval,
} from "../utils/chessReactUtils";
import { ChessEvents } from "../phaser/events/ChessEvents";
import { computeCaptures } from "../phaser/utils/chessUtils";
import { chessPieceGlyph, pairChessHistory, resolveChessParticipants, type ChessColor, type ChessParticipant } from "../utils/chessState";
import type { PieceType } from "../phaser/types/chess.types";

interface ChessMatchPanelProps {
  game?: Phaser.Game | null;
  online: boolean;
}

const PIECE_VALUES: Record<PieceType, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
};

const colorLabel = (color: ChessColor | null) => color === "w" ? "White" : color === "b" ? "Black" : "Pending";
const colorIcon = (color: ChessColor | null) => color === "w" ? "♔" : color === "b" ? "♚" : "–";

/** Shared hook for chess match panel state and real-time timers */
export function useChessPanelState(game: Phaser.Game | null | undefined, online: boolean) {
  const gameState      = useMultiplayerStore((s) => s.gameState) as unknown as ChessRemoteState | null;
  const room           = useMultiplayerStore((s) => s.room);
  const userId         = useAuthStore((s) => s.user?.id);
  const sendGameAction = useMultiplayerStore((s) => s.sendGameAction);
  const socketStatus   = useMultiplayerStore((s) => s.status);

  const [localStatus,   setLocalStatus]   = useState<string>("WHITE'S TURN");
  const [localCaptures, setLocalCaptures] = useState<{ w: PieceType[]; b: PieceType[] }>({ w: [], b: [] });
  const [localHistory, setLocalHistory] = useState<string[]>([]);
  const [isMuted,       setIsMuted]       = useState(false);
  const [tick,          setTick]          = useState(Date.now());

  // Clock tick (100ms)
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  // Scene event bridge (offline / AI)
  useEffect(() => {
    if (!game) return;
    let attachedScene: Phaser.Scene | null = null;
    const onStatus = (status: string) => setLocalStatus(status.toUpperCase());
    const onCaptures = (captures: { w: PieceType[]; b: PieceType[] }) => setLocalCaptures(captures);
    const onHistory = (history: string[]) => setLocalHistory(history);
    setLocalHistory([]);
    const id = setInterval(() => {
      const scene = game.scene.getScene("ChessScene");
      if (!scene) return;
      clearInterval(id);
      attachedScene = scene;
      scene.events.on("chess:hud-status", onStatus);
      scene.events.on("chess:hud-captures", onCaptures);
      scene.events.on(ChessEvents.HISTORY_UPDATED, onHistory);
    }, 100);
    return () => {
      clearInterval(id);
      attachedScene?.events.off("chess:hud-status", onStatus);
      attachedScene?.events.off("chess:hud-captures", onCaptures);
      attachedScene?.events.off(ChessEvents.HISTORY_UPDATED, onHistory);
    };
  }, [game]);

  const s        = online ? gameState : null;
  const isOnline = online;
  const mode     = (game?.registry.get("mode") as "ai" | "pvp") ?? "ai";
  const aiLevel  = (game?.registry.get("aiLevel") as number)    ?? 2;

  const assignment = resolveChessParticipants(s?.players, userId);
  const pendingPlayer: ChessParticipant | { userId: string; seat: number; color: null } = { userId: "", seat: -1, color: null };
  const myPlayer = isOnline ? assignment?.local ?? pendingPlayer : { userId: "local", seat: 0, color: "w" as const };
  const opponent = isOnline ? assignment?.opponent ?? pendingPlayer : { userId: "ai", seat: 1, color: "b" as const };

  const oppName = isOnline
    ? room?.players?.find((p) => p.id === opponent.userId)?.displayName || "Opponent"
    : mode === "ai" ? `StockAI (Lv${aiLevel})` : "Player 2";
  const myName  = isOnline
    ? room?.players?.find((p) => p.id === myPlayer.userId)?.displayName || "You"
    : "Player 1";

  const clocks       = s?.clocks;
  const myKey        = String(myPlayer.seat);
  const oppKey       = String(opponent.seat);
  const myMs         = clocks?.[myKey]  ? liveRemainingMs(clocks[myKey]!,  tick) : Infinity;
  const oppMs        = clocks?.[oppKey] ? liveRemainingMs(clocks[oppKey]!, tick) : Infinity;

  const isMySeatTurn  = isOnline ? myPlayer.seat >= 0 && s?.currentSeat === myPlayer.seat && s?.turn === myPlayer.color : localStatus.includes("WHITE");
  const isOppTurn     = isOnline ? opponent.seat >= 0 && s?.currentSeat === opponent.seat && s?.turn === opponent.color : localStatus.includes("BLACK");

  const drawOfferedByMe = myPlayer.seat >= 0 && s?.drawOfferedBy === myPlayer.seat;
  const canAcceptDraw   = myPlayer.seat >= 0 && s?.drawOfferedBy != null && s.drawOfferedBy !== myPlayer.seat;

  // Material advantage (positive = my advantage)
  const myEval = s?.fen ? materialEval(s.fen) * (myPlayer.color === "b" ? -1 : 1) : 0;

  // Captured pieces from local captures or server history
  const serverCaptures = useMemo(() => s?.fen ? computeCaptures(new Chess(s.fen)) : null, [s?.fen]);
  const captures = serverCaptures ?? localCaptures;
  const myCaptures = myPlayer.color === "b" ? captures.w : myPlayer.color === "w" ? captures.b : [];
  const oppCaptures = opponent.color === "b" ? captures.w : opponent.color === "w" ? captures.b : [];
  const myCaptureScore  = myCaptures.reduce((a, p)  => a + PIECE_VALUES[p],  0);
  const oppCaptureScore = oppCaptures.reduce((a, p) => a + PIECE_VALUES[p], 0);

  // Move history pairs
  const movePairs = pairChessHistory(s?.history ?? localHistory);

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

  return {
    s,
    isOnline,
    mode,
    aiLevel,
    opponent,
    myPlayer,
    oppName,
    myName,
    oppMs,
    myMs,
    isMySeatTurn,
    isOppTurn,
    drawOfferedByMe,
    canAcceptDraw,
    myEval,
    myCaptures,
    oppCaptures,
    myCaptureScore,
    oppCaptureScore,
    movePairs,
    socketStatus,
    isMuted,
    toggleSound,
    handleResign,
    handleOfferDraw,
    handleAcceptDraw,
    handleDeclineDraw,
    hasFloatingExit: !(isOnline && !!room),
  };
}

/** Large digital clock display */
function DigitalClock({ ms, active, compact = false }: { ms: number; active: boolean; compact?: boolean }) {
  const isLow      = ms < 10_000;
  const isCritical = ms < 5_000;
  const hasTime    = ms < Infinity;

  if (!hasTime) return null;

  return (
    <div
      className={`
        flex items-center justify-center
        font-mono font-black tabular-nums tracking-widest
        rounded-xl border transition-all duration-300
        ${compact ? "px-2.5 py-1 text-xs sm:text-sm" : "px-4 py-2 text-xl"}
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

/** Compact player card (avatar icon + name + color badge + captures) */
function PlayerCard({
  name,
  colorIcon,
  colorLabel,
  captures,
  capturedColor,
  materialScore,
  isActive,
  isMe,
  compact = false,
}: {
  name: string;
  colorIcon: string;
  colorLabel: string;
  captures: PieceType[];
  capturedColor: ChessColor | null;
  materialScore: number;
  isActive: boolean;
  isMe: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`
        relative flex items-center gap-2.5 rounded-2xl border transition-all duration-300
        ${compact ? "px-2.5 py-1.5 flex-1 min-w-0" : "px-3 py-2.5 w-full"}
        ${isActive
          ? isMe
            ? "bg-slate-800/90 border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.14)]"
            : "bg-slate-800/90 border-sky-500/60 shadow-[0_0_20px_rgba(56,189,248,0.14)]"
          : "bg-slate-900/60 border-slate-800/80"
        }
      `}
    >
      {/* Color icon avatar */}
      <div
        className={`
          rounded-xl flex items-center justify-center font-bold flex-shrink-0 border
          ${compact ? "w-8 h-8 text-base" : "w-10 h-10 text-xl"}
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
        <div className="flex items-center gap-1.5">
          <p className="font-black text-white text-xs sm:text-sm leading-tight truncate">{name}</p>
          {isActive && (
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isMe ? "bg-amber-400 animate-pulse" : "bg-sky-400 animate-pulse"}`} />
          )}
        </div>
        <p className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-widest leading-tight mt-0.5 ${isMe ? "text-amber-400/70" : "text-sky-400/70"}`}>
          {colorLabel} Pieces
        </p>
        {/* Captured pieces tray */}
        {captures.length > 0 && (
          <div className="flex flex-wrap items-center gap-0.5 mt-0.5">
            {captures.map((p, i) => (
              <span key={i} className="text-[10px] sm:text-[11px] leading-none text-slate-400">{chessPieceGlyph(capturedColor ?? "b", p)}</span>
            ))}
            {materialScore > 0 && (
              <span className="ml-1 text-[9px] sm:text-[10px] font-black text-emerald-400">+{materialScore}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Desktop Sidebar (>= lg) ────────────────────────────────────────────────

export function ChessDesktopSidebar({ game, online }: ChessMatchPanelProps) {
  const {
    s,
    isOnline,
    mode,
    aiLevel,
    opponent,
    myPlayer,
    oppName,
    myName,
    oppMs,
    myMs,
    isMySeatTurn,
    isOppTurn,
    drawOfferedByMe,
    canAcceptDraw,
    myEval,
    myCaptures,
    oppCaptures,
    myCaptureScore,
    oppCaptureScore,
    movePairs,
    socketStatus,
    isMuted,
    toggleSound,
    handleResign,
    handleOfferDraw,
    handleAcceptDraw,
    handleDeclineDraw,
  } = useChessPanelState(game, online);

  const moveHistoryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (moveHistoryRef.current) {
      moveHistoryRef.current.scrollTop = moveHistoryRef.current.scrollHeight;
    }
  });

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
          <button
            onClick={toggleSound}
            className="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center border border-slate-700/60 transition-colors cursor-pointer"
          >
            {isMuted
              ? <VolumeX className="w-3.5 h-3.5 text-rose-400" />
              : <Volume2 className="w-3.5 h-3.5 text-slate-400" />}
          </button>

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
        colorIcon={colorIcon(opponent.color)}
        colorLabel={colorLabel(opponent.color)}
        captures={oppCaptures}
        capturedColor={myPlayer.color}
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
          <span>{colorLabel(myPlayer.color)}</span>
          <span className={`${myEval > 0 ? "text-amber-400" : myEval < 0 ? "text-sky-400" : "text-slate-500"}`}>
            {myEval > 0 ? `+${myEval}` : myEval < 0 ? `${myEval}` : "="}
          </span>
          <span>{colorLabel(opponent.color)}</span>
        </div>
        <div className="relative h-2 w-full bg-slate-800 rounded-full overflow-hidden">
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
        colorIcon={colorIcon(myPlayer.color)}
        colorLabel={colorLabel(myPlayer.color)}
        captures={myCaptures}
        capturedColor={opponent.color}
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
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.02] active:scale-[0.97] cursor-pointer"
            >
              Accept Draw
            </button>
            <button
              onClick={handleDeclineDraw}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px] uppercase tracking-wider border border-slate-700 transition-colors cursor-pointer"
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
            className="flex-1 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-amber-400 border border-slate-700 hover:border-amber-500/40 font-black text-[11px] uppercase tracking-wider transition-all disabled:opacity-40 cursor-pointer"
          >
            Offer Draw
          </button>
        ) : null}

        <button
          onClick={handleResign}
          className="flex-1 py-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 text-rose-400 border border-rose-900/60 hover:border-rose-500/50 font-black text-[11px] uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.97] cursor-pointer"
        >
          Resign
        </button>
      </div>
    </div>
  );
}

// ─── Mobile Top HUD (< lg) ──────────────────────────────────────────────────

export function ChessMobileTop({ game, online }: ChessMatchPanelProps) {
  const {
    opponent,
    myPlayer,
    oppName,
    oppMs,
    isOppTurn,
    oppCaptures,
    oppCaptureScore,
    myCaptureScore,
    isMuted,
    toggleSound,
    isOnline,
    mode,
    aiLevel,
    hasFloatingExit,
  } = useChessPanelState(game, online);

  return (
    <div
      className={`w-full flex items-center justify-between gap-1.5 sm:gap-2 p-1.5 sm:p-2 bg-[#0b0f1a]/95 backdrop-blur-xl border border-slate-800/80 rounded-2xl shadow-lg transition-all ${
        hasFloatingExit ? "pl-11 sm:pl-12 lg:pl-2" : ""
      }`}
    >
      <PlayerCard
        name={oppName}
        colorIcon={colorIcon(opponent.color)}
        colorLabel={colorLabel(opponent.color)}
        captures={oppCaptures}
        capturedColor={myPlayer.color}
        materialScore={oppCaptureScore > myCaptureScore ? oppCaptureScore - myCaptureScore : 0}
        isActive={isOppTurn}
        isMe={false}
        compact={true}
      />
      <div className="flex items-center gap-1.5 shrink-0">
        <DigitalClock ms={oppMs} active={isOppTurn} compact={true} />
        <span className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-slate-800/80 text-[10px] font-bold text-slate-400">
          {isOnline ? "PvP" : mode === "ai" ? `AI Lv${aiLevel}` : "Local"}
        </span>
        <button
          onClick={toggleSound}
          className="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center border border-slate-700/60 transition-colors text-slate-400 cursor-pointer"
          title="Toggle Sound"
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ─── Mobile Bottom HUD (< lg) ───────────────────────────────────────────────

export interface ChessMobileBottomProps extends ChessMatchPanelProps {
  onReplay?: () => void;
}

export function ChessMobileBottom({ game, online, onReplay }: ChessMobileBottomProps) {
  const {
    myPlayer,
    opponent,
    myName,
    myMs,
    isMySeatTurn,
    myCaptures,
    myCaptureScore,
    oppCaptureScore,
    myEval,
    movePairs,
    isOnline,
    drawOfferedByMe,
    canAcceptDraw,
    handleOfferDraw,
    handleAcceptDraw,
    handleResign,
  } = useChessPanelState(game, online);

  const [showHistoryModal, setShowHistoryModal] = useState(false);

  return (
    <div className="w-full flex flex-col gap-1.5 sm:gap-2">
      {/* Player Card + Clock + Turn Pill */}
      <div className="flex items-center justify-between gap-1.5 sm:gap-2 p-1.5 sm:p-2 bg-[#0b0f1a]/95 backdrop-blur-xl border border-slate-800/80 rounded-2xl shadow-lg">
        <PlayerCard
          name={myName}
          colorIcon={colorIcon(myPlayer.color)}
          colorLabel={colorLabel(myPlayer.color)}
          captures={myCaptures}
          capturedColor={opponent.color}
          materialScore={myCaptureScore > oppCaptureScore ? myCaptureScore - oppCaptureScore : 0}
          isActive={isMySeatTurn}
          isMe={true}
          compact={true}
        />
        <div className="flex items-center gap-1.5 shrink-0">
          <DigitalClock ms={myMs} active={isMySeatTurn} compact={true} />
          <div className={`px-2 py-1 rounded-lg border font-black text-[10px] tracking-wider uppercase flex items-center gap-1 ${
            isMySeatTurn
              ? "bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse"
              : "bg-slate-800/60 border-slate-700/60 text-slate-400"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isMySeatTurn ? "bg-amber-400" : "bg-slate-500"}`} />
            <span>{isMySeatTurn ? "YOUR TURN" : "WAITING"}</span>
          </div>
        </div>
      </div>

      {/* Material advantage thin bar */}
      <div className="relative h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(5, 50 + myEval * 4.5))}%` }}
        />
      </div>

      {/* Action Row */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={() => setShowHistoryModal(true)}
          className="flex-1 py-1.5 sm:py-2 px-2.5 sm:px-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-95"
        >
          <ScrollText size={14} className="text-amber-400" />
          <span>Moves ({movePairs.length})</span>
        </button>

        {isOnline ? (
          <button
            onClick={canAcceptDraw ? handleAcceptDraw : handleOfferDraw}
            disabled={drawOfferedByMe}
            className="py-1.5 sm:py-2 px-2.5 sm:px-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <Handshake size={14} className="text-indigo-400" />
            <span>{canAcceptDraw ? "Accept Draw" : "Draw"}</span>
          </button>
        ) : onReplay ? (
          <button
            onClick={onReplay}
            className="py-1.5 sm:py-2 px-2.5 sm:px-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-rose-400 hover:text-rose-300 border border-slate-800 hover:border-rose-900/50 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-95"
            title="Reset Match"
          >
            <RefreshCcw size={13} />
            <span>Reset</span>
          </button>
        ) : null}

        <button
          onClick={handleResign}
          className="py-1.5 sm:py-2 px-3 sm:px-4 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-900/60 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-95"
        >
          <Flag size={14} className="text-rose-400" />
          <span>Resign</span>
        </button>
      </div>

      {/* ── MOBILE MOVE HISTORY MODAL ── */}
      {showHistoryModal && (
        <div className="lg:hidden fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div
            className="fixed inset-0"
            onClick={() => setShowHistoryModal(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-sm bg-slate-900/98 border border-slate-700/80 rounded-3xl p-5 shadow-2xl flex flex-col gap-3 max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ScrollText size={16} className="text-amber-400" />
                <h3 className="text-sm font-black text-white">Move History</h3>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-bold text-slate-400">
                  {movePairs.length} turns
                </span>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[50vh] pr-1 scrollbar-thin scrollbar-thumb-slate-700">
              {movePairs.length === 0 ? (
                <p className="text-slate-500 text-center py-8 italic text-xs">No moves recorded yet</p>
              ) : (
                <div className="font-mono text-xs divide-y divide-slate-800/40">
                  {movePairs.map((pair, idx) => {
                    const isLatest = idx === movePairs.length - 1;
                    return (
                      <div
                        key={pair.num}
                        className={`flex items-center px-2 py-1.5 ${
                          isLatest ? "bg-amber-500/10 text-amber-300 font-bold" : "text-slate-300"
                        }`}
                      >
                        <span className="w-8 text-slate-500 font-bold">{pair.num}.</span>
                        <span className="flex-1">{pair.white}</span>
                        <span className="flex-1 text-slate-400">{pair.black ?? "-"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowHistoryModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const ChessMatchPanel = ChessDesktopSidebar;
export default ChessMatchPanel;
