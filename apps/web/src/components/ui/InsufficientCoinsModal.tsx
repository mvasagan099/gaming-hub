import React, { useEffect } from "react";
import { Coins, X, ArrowRight, RefreshCw, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface InsufficientCoinsModalProps {
  isOpen: boolean;
  onClose: () => void;
  requiredCoins: number;
  currentBalance: number;
  gameTitle?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function InsufficientCoinsModal({
  isOpen,
  onClose,
  requiredCoins,
  currentBalance,
  gameTitle,
  onRetry,
  isRetrying = false,
}: InsufficientCoinsModalProps) {
  const navigate = useNavigate();
  const difference = Math.max(0, requiredCoins - currentBalance);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="insufficient-coins-title"
    >
      <div
        className="relative w-full max-w-md bg-neutral-900/95 border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden p-6 text-white text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white p-1 rounded-full hover:bg-neutral-800 transition"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Coin Icon Header */}
        <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-tr from-amber-500/20 to-yellow-500/10 border border-amber-500/40 flex items-center justify-center mb-4 text-amber-400 shadow-lg shadow-amber-500/10">
          <Coins className="w-8 h-8 animate-pulse text-amber-500" />
        </div>

        <h3
          id="insufficient-coins-title"
          className="text-xl font-bold text-neutral-100 mb-1"
        >
          Not Enough Coins
        </h3>
        <p className="text-sm text-neutral-400 mb-6">
          {gameTitle ? `To join ${gameTitle}, you need more coins.` : "You need more coins to complete this entry."}
        </p>

        {/* Breakdown Card */}
        <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4 mb-6 text-left space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-neutral-400">Entry Fee:</span>
            <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-amber-400" /> {requiredCoins.toLocaleString()} Coins
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-neutral-400">Your Balance:</span>
            <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-amber-400" /> {currentBalance.toLocaleString()} Coins
            </span>
          </div>
          <div className="pt-2 border-t border-neutral-800/80 flex justify-between items-center text-sm font-bold">
            <span className="text-amber-400 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" /> You need:
            </span>
            <span className="text-amber-400 text-base">
              {difference.toLocaleString()} more Coins
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => {
              onClose();
              navigate("/wallet");
            }}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 hover:scale-[1.01] active:scale-[0.99] transition"
          >
            <span>GET COINS</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {onRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className="w-full py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRetrying ? "animate-spin" : ""}`} />
              <span>Retry Entry</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full py-2 px-4 rounded-xl text-neutral-400 hover:text-neutral-200 text-sm font-medium transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
