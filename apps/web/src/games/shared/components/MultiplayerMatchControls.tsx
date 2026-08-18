import { useMemo } from "react";
import {
  Check,
  Flag,
  Handshake,
  Loader2,
  Pause,
  Play,
  RefreshCcw,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import type { JsonObject } from "@gaming-hub/shared";
import { useMultiplayerStore } from "../../../store/multiplayerStore";
import { useAuthStore } from "../../../store/authStore";

/**
 * Standard player actions for any room-based match: resign, draw offer /
 * accept / decline, pause / resume, and the post-match rematch flow.
 *
 * The base-engine action buttons only render when the live state carries the
 * base multiplayer fields (`drawOfferedBy` / `paused`); games like Chess with
 * their own dedicated match panel and engine keep their own action UI.
 * Rematch consent is room-level and therefore shown for every game.
 */
export function MultiplayerMatchControls() {
  const room = useMultiplayerStore((s) => s.room);
  const gameState = useMultiplayerStore((s) => s.gameState);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const isSpectator = useMultiplayerStore((s) => s.isSpectator);
  const rematchState = useMultiplayerStore((s) => s.rematchState);
  const winner = useMultiplayerStore((s) => s.winner);
  const countdown = useMultiplayerStore((s) => s.countdown);
  const setReady = useMultiplayerStore((s) => s.setReady);
  const startGame = useMultiplayerStore((s) => s.startGame);
  const sendGameAction = useMultiplayerStore((s) => s.sendGameAction);
  const requestRematch = useMultiplayerStore((s) => s.requestRematch);
  const acceptRematch = useMultiplayerStore((s) => s.acceptRematch);
  const declineRematch = useMultiplayerStore((s) => s.declineRematch);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const state = gameState as (JsonObject & {
    finished?: boolean;
    currentSeat?: number;
    drawOfferedBy?: number | null;
    paused?: boolean;
    pausedBy?: number | null;
  }) | null;

  const baseEngine = Boolean(state && "drawOfferedBy" in state);
  const playing = room?.status === "playing" && state && !state.finished;
  const ended = room?.status === "ended" || state?.finished;
  const canAct = mySeat !== null && !isSpectator;

  const run = async (action: { type: string } & JsonObject) => {
    const result = await sendGameAction(action);
    if (!result.ok && result.error) toast.error(result.error);
  };

  const rematchChip = useMemo(() => {
    if (!ended || !room) return null;
    if (!rematchState || !rematchState.active) {
      return (
        <button
          onClick={() => void requestRematch()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors"
          title="Ask everyone to play again"
        >
          <RefreshCcw className="w-3.5 h-3.5" /> Rematch
        </button>
      );
    }
    const iAsked = userId != null && rematchState.requestedBy.includes(userId);
    if (iAsked) {
      return (
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-[10px] text-slate-400">
            <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
            Waiting for opponent…
          </div>
          <button
            onClick={() => void declineRematch()}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-rose-400 transition-colors"
            title="Cancel rematch"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => void acceptRematch()}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors"
        >
          <Check className="w-3.5 h-3.5" /> Rematch
        </button>
        <button
          onClick={() => void declineRematch()}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-rose-400 transition-colors"
          title="Decline rematch"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }, [ended, room, rematchState, userId, requestRematch, acceptRematch, declineRematch]);

  if (!room) return null;

  return (
    <div className="space-y-2">
      {/* ── Lobby Ready & Countdown Controls ── */}
      {(room.status === "waiting" || room.status === "starting" || countdown !== null) && (
        <div className="space-y-2">
          {countdown !== null || room.status === "starting" ? (
            <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-indigo-950/80 border border-indigo-500/50 shadow-lg shadow-indigo-500/20 text-center animate-pulse">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">Match Starting</span>
              <span className="text-3xl font-black text-amber-400 my-0.5">
                {countdown === 0 ? "GO!" : countdown ?? 3}
              </span>
              <span className="text-[9px] text-slate-400">All players ready</span>
            </div>
          ) : isSpectator ? (
            <div className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-400 text-xs">
              Spectating lobby...
            </div>
          ) : (
            <div className="space-y-2">
              {(() => {
                const meInRoom = room.players.find((p) => p.id === userId);
                const isMeReady = meInRoom?.isReady ?? false;
                const isHost = meInRoom?.isHost ?? false;
                const allReady = room.players.filter((p) => !p.isSpectator).every((p) => p.isReady);

                return (
                  <>
                    <button
                      onClick={() => void setReady(!isMeReady)}
                      className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-black text-sm tracking-wide shadow-md transition-all active:scale-95 ${
                        isMeReady
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30"
                          : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black shadow-orange-500/30"
                      }`}
                    >
                      {isMeReady ? (
                        <>
                          <Check className="w-4 h-4" /> READY (CLICK TO UNREADY)
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current" /> READY UP
                        </>
                      )}
                    </button>

                    {isHost && allReady && (
                      <button
                        onClick={() => void startGame()}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all active:scale-95"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" /> START MATCH NOW
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
      {playing && canAct && baseEngine && (
        <div className="grid grid-cols-2 gap-2">
          {/* Resign */}
          <button
            onClick={() => void run({ type: "resign" })}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-bold transition-colors"
            title="Resign the match"
          >
            <Flag className="w-3.5 h-3.5" /> Resign
          </button>

          {/* Draw offer / accept / decline */}
          {state && state.drawOfferedBy === mySeat ? (
            <div className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-[10px] text-slate-400">
              <Handshake className="w-3.5 h-3.5 text-indigo-400" /> Draw offered
            </div>
          ) : state && state.drawOfferedBy != null ? (
            <>
              <button
                onClick={() => void run({ type: "draw-accept" })}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white font-bold transition-colors"
                title="Accept the draw"
              >
                <Check className="w-3.5 h-3.5" /> Draw
              </button>
              <button
                onClick={() => void run({ type: "draw-decline" })}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-rose-400 font-bold transition-colors"
                title="Decline the draw"
              >
                <X className="w-3.5 h-3.5" /> Decline
              </button>
            </>
          ) : (
            <button
              onClick={() => void run({ type: "draw-offer" })}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold transition-colors"
              title="Offer a draw"
            >
              <Handshake className="w-3.5 h-3.5" /> Offer draw
            </button>
          )}

          {/* Pause / resume */}
          {state && state.paused ? (
            <button
              onClick={() => void run({ type: "resume" })}
              className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600/80 hover:bg-amber-600 text-white font-bold transition-colors"
              title="Resume the match"
            >
              <Play className="w-3.5 h-3.5" /> Resume match
            </button>
          ) : (
            <button
              onClick={() => void run({ type: "pause" })}
              className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold transition-colors"
              title="Pause the match"
            >
              <Pause className="w-3.5 h-3.5" /> Pause match
            </button>
          )}
        </div>
      )}

      {playing && canAct && !baseEngine && (
        <div className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-[10px] text-slate-500">
          In-match controls are provided by this game
        </div>
      )}

      {ended && (
        <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-700 shadow-xl flex flex-col gap-2.5">
          {/* Result Header Badge */}
          {(() => {
            const isWinner = winner?.winnerIds?.includes(userId ?? "");
            const isDraw = winner && winner.winnerIds.length === 0;
            const stake = room.stake;
            const playerCount = room.players.length;
            const totalPot = stake * playerCount;
            const prizePool = Math.round(totalPot * 0.9);
            const winnerPayout = winner && winner.winnerIds.length > 0 ? Math.round(prizePool / winner.winnerIds.length) : 0;
            const netCoins = isWinner ? winnerPayout - stake : isDraw ? 0 : -stake;

            return (
              <>
                <div
                  className={`flex flex-col items-center justify-center p-3 rounded-xl text-center border shadow-md ${
                    isWinner
                      ? "bg-emerald-950/80 border-emerald-500/60 shadow-emerald-500/20 text-emerald-300"
                      : isDraw
                        ? "bg-amber-950/80 border-amber-500/60 shadow-amber-500/20 text-amber-300"
                        : "bg-rose-950/80 border-rose-500/60 shadow-rose-500/20 text-rose-300"
                  }`}
                >
                  <span className="text-xl font-black tracking-wide">
                    {isWinner ? "🏆 YOU WIN!" : isDraw ? "🤝 MATCH DRAWN" : "💔 YOU LOST"}
                  </span>
                  <span className="text-[10px] font-semibold opacity-80 mt-0.5">
                    {isWinner
                      ? "Authoritative Victory!"
                      : isDraw
                        ? "Equal score — Entry fee refunded"
                        : "Better luck next time"}
                  </span>
                </div>

                {/* Coins Summary Card */}
                {stake > 0 && (
                  <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                    <div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase">Entry</div>
                      <div className="text-xs font-extrabold text-slate-300">{stake}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase">Prize</div>
                      <div className="text-xs font-extrabold text-amber-400">
                        {isWinner ? winnerPayout : isDraw ? stake : 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase">Net</div>
                      <div
                        className={`text-xs font-black ${
                          netCoins > 0
                            ? "text-emerald-400"
                            : netCoins === 0
                              ? "text-slate-400"
                              : "text-rose-400"
                        }`}
                      >
                        {netCoins > 0 ? `+${netCoins}` : netCoins}
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* Rematch flow */}
          {rematchChip}
        </div>
      )}
    </div>
  );
}
