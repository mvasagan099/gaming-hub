import React, { useEffect, useState } from "react";
import Phaser from "phaser";
import { ChessEvents } from "../phaser/events/ChessEvents";
import { Trophy, Shield, XCircle, RotateCcw, Flag, Handshake } from "lucide-react";
import { claimPracticeReward } from "../../../services/api/practiceReward";
import { useMultiplayerStore } from "../../../store/multiplayerStore";

interface ChessOverlaysProps {
  game: Phaser.Game | null;
  online?: boolean;
  onReplay: () => void;
  onClose: () => void;
}

interface MpResult {
  result: "win" | "lose" | "draw";
  name: string;
}

export const ChessOverlays: React.FC<ChessOverlaysProps> = ({ game, online = false, onReplay, onClose }) => {
  const [gameOverMsg, setGameOverMsg] = useState<string | null>(null);
  const [mpResult, setMpResult] = useState<MpResult | null>(null);
  const [promotionData, setPromotionData] = useState<{ from: string; to: string } | null>(null);
  const [hasRewarded, setHasRewarded] = useState(false);
  const [showDrawOffer, setShowDrawOffer] = useState(false);
  const gameState = useMultiplayerStore((s) => s.gameState);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const renderKey = useMultiplayerStore((s) => s.renderKey); // Force re-render on state changes
  const sendGameAction = useMultiplayerStore((s) => s.sendGameAction);

  const drawOfferedBySeat = gameState?.drawOfferedBy;
  const isDrawOfferedByOpponent =
    online &&
    drawOfferedBySeat != null &&
    drawOfferedBySeat !== mySeat &&
    !gameState?.finished;

  const isDrawOfferedByMe =
    online &&
    drawOfferedBySeat != null &&
    drawOfferedBySeat === mySeat &&
    !gameState?.finished;

  useEffect(() => {
    if (!game) return;

    // We need to wait for the scene to be ready
    const timer = setInterval(() => {
      const scene = game.scene.getScene("ChessScene");
      if (scene) {
        clearInterval(timer);

        scene.events.on(ChessEvents.GAME_OVER, (msg: string) => {
          if (msg.startsWith("MP|")) {
            const [, kind, name] = msg.split("|");
            if (kind === "reset") {
              setGameOverMsg(null);
              setMpResult(null);
              return;
            }
            setMpResult({ result: kind as MpResult["result"], name: name ?? "" });
            setGameOverMsg(msg);
            return;
          }

          setGameOverMsg(msg);

          // Only reward once per game over if White (Human) wins
          if (msg.includes("White Wins") && !hasRewarded) {
            setHasRewarded(true);
            setTimeout(() => {
              void claimPracticeReward("chess");
            }, 1000);
          }
        });

        scene.events.on(ChessEvents.PROMOTION_NEEDED, (from: string, to: string) => {
          setPromotionData({ from, to });
        });
      }
    }, 100);

    return () => {
      clearInterval(timer);
    };
  }, [game, hasRewarded]);

  const handlePromotion = (pieceType: "q" | "r" | "b" | "n") => {
    if (!game || !promotionData) return;
    const scene = game.scene.getScene("ChessScene");
    if (scene) {
      scene.events.emit(ChessEvents.PROMOTION_CHOSEN, promotionData.from, promotionData.to, pieceType);
      setPromotionData(null);
    }
  };

  const handleResign = () => {
    sendGameAction?.({ type: "resign" });
  };

  const handleOfferDraw = () => {
    sendGameAction?.({ type: "draw-offer" });
    setShowDrawOffer(false);
  };

  const handleAcceptDraw = () => {
    sendGameAction?.({ type: "draw-accept" });
    setShowDrawOffer(false);
  };

  const handleDeclineDraw = () => {
    sendGameAction?.({ type: "draw-decline" });
    setShowDrawOffer(false);
  };

  return (
    <>
      {/* PAWN PROMOTION MODAL */}
      {promotionData && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-sky-500/30 p-6 rounded-2xl shadow-2xl flex flex-col items-center">
            <h3 className="text-sky-400 font-bold uppercase tracking-wider mb-4">Promote Pawn</h3>
            <div className="flex gap-4">
              <button
                onClick={() => handlePromotion("q")}
                className="w-16 h-16 bg-slate-800 hover:bg-sky-900/50 rounded-xl border border-slate-700 hover:border-sky-500 transition-all flex items-center justify-center text-4xl text-white"
              >
                ♕
              </button>
              <button
                onClick={() => handlePromotion("r")}
                className="w-16 h-16 bg-slate-800 hover:bg-sky-900/50 rounded-xl border border-slate-700 hover:border-sky-500 transition-all flex items-center justify-center text-4xl text-white"
              >
                ♖
              </button>
              <button
                onClick={() => handlePromotion("b")}
                className="w-16 h-16 bg-slate-800 hover:bg-sky-900/50 rounded-xl border border-slate-700 hover:border-sky-500 transition-all flex items-center justify-center text-4xl text-white"
              >
                ♗
              </button>
              <button
                onClick={() => handlePromotion("n")}
                className="w-16 h-16 bg-slate-800 hover:bg-sky-900/50 rounded-xl border border-slate-700 hover:border-sky-500 transition-all flex items-center justify-center text-4xl text-white"
              >
                ♘
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAW OFFER MODAL / BANNER */}
      {(showDrawOffer || isDrawOfferedByOpponent) && online && !gameOverMsg && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0f172a] border border-amber-500/40 p-6 rounded-2xl shadow-2xl flex flex-col items-center max-w-md w-full mx-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 mb-3 border border-amber-500/40 animate-pulse">
              <Handshake className="w-6 h-6" />
            </div>
            <h3 className="text-amber-400 font-black uppercase tracking-wider text-base mb-2">
              {isDrawOfferedByOpponent ? "Draw Offer Received" : "Offer a Draw"}
            </h3>
            <p className="text-slate-300 text-xs mb-6 text-center leading-relaxed">
              {isDrawOfferedByOpponent
                ? "Your opponent has offered a draw. Would you like to accept or decline?"
                : isDrawOfferedByMe
                ? "You offered a draw. Waiting for opponent to respond..."
                : "Offer a draw to your opponent for this match?"}
            </p>
            <div className="flex gap-3 w-full">
              {isDrawOfferedByOpponent ? (
                <>
                  <button
                    onClick={handleAcceptDraw}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-600/20"
                  >
                    Accept Draw
                  </button>
                  <button
                    onClick={handleDeclineDraw}
                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-rose-600/20"
                  >
                    Decline
                  </button>
                </>
              ) : isDrawOfferedByMe ? (
                <button
                  onClick={handleDeclineDraw}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-slate-700"
                >
                  Withdraw Offer
                </button>
              ) : (
                <>
                  <button
                    onClick={handleOfferDraw}
                    className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-amber-600/20"
                  >
                    Offer Draw
                  </button>
                  <button
                    onClick={() => setShowDrawOffer(false)}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-slate-700"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* IN-GAME ACTIONS (bottom overlay) */}
      {online && !gameOverMsg && !promotionData && !showDrawOffer && (
        <div className="absolute bottom-4 right-4 z-40 flex gap-2">
          {isDrawOfferedByOpponent ? (
            <>
              <button
                onClick={handleAcceptDraw}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/30 flex items-center gap-2 animate-bounce"
              >
                <Handshake className="w-4 h-4" /> Accept Draw
              </button>
              <button
                onClick={handleDeclineDraw}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all border border-slate-700"
              >
                Decline
              </button>
            </>
          ) : isDrawOfferedByMe ? (
            <button
              disabled
              className="px-4 py-2 bg-amber-600/50 text-amber-200 text-xs font-bold rounded-xl border border-amber-500/30 flex items-center gap-2 cursor-not-allowed"
            >
              <Handshake className="w-4 h-4 animate-pulse" /> Draw Offered...
            </button>
          ) : (
            <button
              onClick={() => setShowDrawOffer(true)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-amber-600/20 flex items-center gap-2"
            >
              <Handshake className="w-4 h-4" /> Draw
            </button>
          )}
          <button
            onClick={handleResign}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-rose-600/20 flex items-center gap-2"
          >
            <Flag className="w-4 h-4" /> Resign
          </button>
        </div>
      )}

      {/* GAME OVER MODAL */}
      {gameOverMsg && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-slate-700 p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full mx-4 transform transition-all scale-100 animate-in zoom-in-95 duration-500">
            
            {mpResult ? (
              <div className={`w-20 h-20 rounded-full flex items-center justify-center border-2 mb-4 ${
                mpResult.result === "win"
                  ? "bg-emerald-500/20 border-emerald-500/50 animate-bounce"
                  : mpResult.result === "draw"
                    ? "bg-slate-500/20 border-slate-500/50"
                    : "bg-rose-500/20 border-rose-500/50"
              }`}>
                {mpResult.result === "win" ? (
                  <Trophy className="w-10 h-10 text-emerald-400" />
                ) : mpResult.result === "draw" ? (
                  <Shield className="w-10 h-10 text-slate-400" />
                ) : (
                  <XCircle className="w-10 h-10 text-rose-400" />
                )}
              </div>
            ) : gameOverMsg.includes("White Wins") ? (
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center border-2 border-emerald-500/50 mb-4 animate-bounce">
                <Trophy className="w-10 h-10 text-emerald-400" />
              </div>
            ) : gameOverMsg.includes("Draw") ? (
              <div className="w-20 h-20 rounded-full bg-slate-500/20 flex items-center justify-center border-2 border-slate-500/50 mb-4">
                <Shield className="w-10 h-10 text-slate-400" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-full bg-rose-500/20 flex items-center justify-center border-2 border-rose-500/50 mb-4">
                <XCircle className="w-10 h-10 text-rose-400" />
              </div>
            )}

            <h2 className={`text-3xl font-black uppercase tracking-widest text-center mb-2 ${
              mpResult
                ? mpResult.result === "win"
                  ? "text-emerald-400"
                  : mpResult.result === "draw"
                    ? "text-slate-300"
                    : "text-rose-500"
                : gameOverMsg.includes("White Wins") ? "text-emerald-400" : gameOverMsg.includes("Draw") ? "text-slate-300" : "text-rose-500"
            }`}>
              {mpResult
                ? mpResult.result === "win"
                  ? "YOU WON!"
                  : mpResult.result === "draw"
                    ? "DRAW"
                    : `${mpResult.name.toUpperCase()} WON`
                : gameOverMsg.includes("White Wins") ? "YOU WON!" : gameOverMsg.includes("Draw") ? "DRAW" : "AI WON..."}
            </h2>
            
            <p className="text-slate-400 text-sm text-center mb-6 font-medium">
              {mpResult ? (mpResult.result === "draw" ? "Draw" : `Checkmate! ${mpResult.name} wins`) : gameOverMsg}
            </p>

            {!online && gameOverMsg.includes("White Wins") && (
              <div className="bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 mb-6 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                🪙 +50 Coins Added!
              </div>
            )}

            <div className="flex gap-3 w-full">
              <button
                onClick={onReplay}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
              >
                <RotateCcw className="w-4 h-4" /> Replay
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all border border-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
