import React, { useEffect, useState } from "react";
import Phaser from "phaser";
import { ChessEvents } from "../phaser/events/ChessEvents";
import { Trophy, Shield, XCircle, RotateCcw, Flag, Handshake, Sparkles, Swords } from "lucide-react";
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
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showMatchIntro, setShowMatchIntro] = useState(true);

  const room = useMultiplayerStore((s) => s.room);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const sendGameAction = useMultiplayerStore((s) => s.sendGameAction);

  // Match intro timer (< 1.8s)
  useEffect(() => {
    const t = setTimeout(() => {
      setShowMatchIntro(false);
    }, 1800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!game) return;

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

  const handleResignConfirmed = () => {
    sendGameAction?.({ type: "resign" });
    setShowResignConfirm(false);
  };

  const opponentPlayer = room?.players?.find((p) => p.seat !== mySeat);
  const myPlayer = room?.players?.find((p) => p.seat === mySeat);

  return (
    <>
      {/* ── MATCH INTRO OVERLAY (< 1.8s) ── */}
      {showMatchIntro && !gameOverMsg && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none animate-out fade-out duration-500">
          <div className="flex flex-col items-center justify-center p-6 bg-slate-900/90 border border-amber-500/40 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] transform scale-105 animate-in zoom-in-95 duration-300">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center border border-amber-500/40 mb-3 shadow-[0_0_20px_rgba(245,158,11,0.25)]">
              <Swords className="w-6 h-6 text-amber-400" />
            </div>

            <h3 className="text-xl font-black text-white uppercase tracking-wider mb-2">Match Starting</h3>

            <div className="flex items-center gap-6 my-2">
              <div className="text-center">
                <p className="text-sm font-black text-amber-300 truncate max-w-[100px]">{myPlayer?.displayName || "You"}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold">White</p>
              </div>
              <span className="text-xs font-black text-amber-500">VS</span>
              <div className="text-center">
                <p className="text-sm font-black text-sky-300 truncate max-w-[100px]">{opponentPlayer?.displayName || "Opponent"}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Black</p>
              </div>
            </div>

            <div className="mt-3 px-4 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-[11px] font-black text-amber-400 tracking-widest uppercase">
              Play!
            </div>
          </div>
        </div>
      )}

      {/* ── PAWN PROMOTION MODAL ── */}
      {promotionData && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-amber-500/40 p-6 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full mx-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center border border-amber-500/40 mb-3 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              <Sparkles className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="text-white font-black text-lg uppercase tracking-wider mb-1">Promote Pawn</h3>
            <p className="text-slate-400 text-xs mb-5 text-center">Choose your promoted piece</p>

            <div className="grid grid-cols-4 gap-3 w-full">
              {[
                { type: "q" as const, symbol: "♕", name: "Queen" },
                { type: "r" as const, symbol: "♖", name: "Rook" },
                { type: "b" as const, symbol: "♗", name: "Bishop" },
                { type: "n" as const, symbol: "♘", name: "Knight" },
              ].map((p) => (
                <button
                  key={p.type}
                  onClick={() => handlePromotion(p.type)}
                  className="group flex flex-col items-center justify-center p-3.5 bg-slate-800/80 hover:bg-amber-500/20 rounded-2xl border border-slate-700 hover:border-amber-500/60 transition-all hover:scale-105 active:scale-95 shadow-lg"
                >
                  <span className="text-3xl text-white group-hover:text-amber-400 transition-colors drop-shadow-md mb-1">{p.symbol}</span>
                  <span className="text-[10px] font-bold text-slate-400 group-hover:text-amber-300 uppercase tracking-wider">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── RESIGN CONFIRMATION MODAL ── */}
      {showResignConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-rose-500/40 p-6 rounded-3xl shadow-2xl flex flex-col items-center max-w-xs w-full mx-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 flex items-center justify-center border border-rose-500/40 mb-3 shadow-[0_0_15px_rgba(244,63,94,0.2)]">
              <Flag className="w-6 h-6 text-rose-400" />
            </div>
            <h3 className="text-white font-black text-lg uppercase tracking-wider mb-1">Resign Game?</h3>
            <p className="text-slate-400 text-xs mb-5 text-center">Are you sure you want to forfeit this match?</p>

            <div className="flex gap-2.5 w-full">
              <button
                onClick={() => setShowResignConfirm(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-colors uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={handleResignConfirmed}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl transition-colors shadow-lg shadow-rose-600/30 uppercase tracking-wider"
              >
                Resign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── VICTORY / GAME OVER RESULT MODAL ── */}
      {gameOverMsg && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-amber-500/40 p-8 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.9)] flex flex-col items-center max-w-sm w-full mx-4 text-center">
            {/* Header Icon */}
            {mpResult?.result === "win" || gameOverMsg.includes("White Wins") ? (
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center border border-amber-500/50 mb-4 shadow-[0_0_25px_rgba(245,158,11,0.3)] animate-bounce">
                <Trophy className="w-8 h-8 text-amber-400" />
              </div>
            ) : mpResult?.result === "draw" || gameOverMsg.includes("Draw") ? (
              <div className="w-16 h-16 rounded-2xl bg-sky-500/20 flex items-center justify-center border border-sky-500/50 mb-4 shadow-[0_0_25px_rgba(56,189,248,0.3)]">
                <Handshake className="w-8 h-8 text-sky-400" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-rose-500/20 flex items-center justify-center border border-rose-500/50 mb-4 shadow-[0_0_25px_rgba(244,63,94,0.3)]">
                <XCircle className="w-8 h-8 text-rose-400" />
              </div>
            )}

            {/* Title */}
            <h2 className="text-2xl font-black text-white tracking-wide uppercase mb-1">
              {mpResult?.result === "win" || gameOverMsg.includes("White Wins")
                ? "Victory!"
                : mpResult?.result === "draw" || gameOverMsg.includes("Draw")
                  ? "Draw Match"
                  : "Game Over"}
            </h2>

            <p className="text-sm font-bold text-amber-400/90 uppercase tracking-widest mb-4">
              {gameOverMsg.replace("MP|win|", "").replace("MP|lose|", "").replace("MP|draw|", "")}
            </p>

            {/* Match Rewards */}
            {gameOverMsg.includes("White Wins") && (
              <div className="w-full py-2.5 px-4 bg-amber-500/10 border border-amber-500/30 rounded-xl font-bold text-xs text-amber-400 mb-5 flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span>+50 Coins Practice Reward!</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5 w-full">
              <button
                onClick={onReplay}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-xl shadow-amber-500/30 transform hover:scale-[1.02] active:scale-[0.98] transition-all tracking-wider uppercase flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Play Again
              </button>
              <button
                onClick={onClose}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition-colors uppercase tracking-wider"
              >
                Exit to Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChessOverlays;
