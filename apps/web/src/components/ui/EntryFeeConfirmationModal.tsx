import React, { useEffect } from "react";
import { Coins, X, ArrowRight, Loader2, ShieldCheck, Trophy, Swords } from "lucide-react";

export interface EntryFeeConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  entryFee: number;
  currentBalance: number;
  mode?: "GAME" | "TOURNAMENT";
  extraDetails?: {
    format?: string;
    slots?: string;
    opponentName?: string;
  };
  isConfirming?: boolean;
}

export function EntryFeeConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  entryFee,
  currentBalance,
  mode = "GAME",
  extraDetails,
  isConfirming = false,
}: EntryFeeConfirmationModalProps) {
  const balanceAfter = Math.max(0, currentBalance - entryFee);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isConfirming) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isConfirming]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="entry-confirmation-title"
    >
      <div
        className="relative w-full max-w-md bg-neutral-900/95 border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden p-6 text-white text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isConfirming}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white p-1 rounded-full hover:bg-neutral-800 transition disabled:opacity-50"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon Header */}
        <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-tr from-amber-500/20 to-yellow-500/10 border border-amber-500/40 flex items-center justify-center mb-4 text-amber-400 shadow-lg shadow-amber-500/10">
          {mode === "TOURNAMENT" ? (
            <Trophy className="w-8 h-8 text-amber-400" />
          ) : (
            <Swords className="w-8 h-8 text-amber-400" />
          )}
        </div>

        <h3
          id="entry-confirmation-title"
          className="text-xl font-bold text-neutral-100 mb-1"
        >
          {mode === "TOURNAMENT" ? "Register for Tournament" : "Join Game Match"}
        </h3>
        <p className="text-sm font-medium text-amber-400 mb-5">
          {title}
        </p>

        {/* Financial Breakdown Card */}
        <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4 mb-5 text-left space-y-2.5">
          <div className="flex justify-between items-center text-sm">
            <span className="text-neutral-400">Entry Fee:</span>
            <span className="font-bold text-amber-400 flex items-center gap-1">
              🪙 {entryFee.toLocaleString()} Coins
            </span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-neutral-400">Current Balance:</span>
            <span className="font-semibold text-neutral-200">
              🪙 {currentBalance.toLocaleString()} Coins
            </span>
          </div>

          {extraDetails?.opponentName && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-neutral-400">Opponent:</span>
              <span className="font-medium text-neutral-300">{extraDetails.opponentName}</span>
            </div>
          )}

          {extraDetails?.slots && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-neutral-400">Slots:</span>
              <span className="font-medium text-neutral-300">{extraDetails.slots}</span>
            </div>
          )}

          <div className="pt-2 border-t border-neutral-800/80 flex justify-between items-center text-sm font-semibold">
            <span className="text-neutral-300">Balance After Entry:</span>
            <span className="text-emerald-400 font-bold">
              🪙 {balanceAfter.toLocaleString()} Coins
            </span>
          </div>
        </div>

        {/* Security Assurance Badge */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-neutral-400 mb-6">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Atomic coin deduction • Instant refund if match cancelled</span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={onConfirm}
            disabled={isConfirming}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 hover:scale-[1.01] active:scale-[0.99] transition disabled:opacity-60 disabled:hover:scale-100"
          >
            {isConfirming ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{mode === "TOURNAMENT" ? "Registering..." : "Joining..."}</span>
              </>
            ) : (
              <>
                <span>{mode === "TOURNAMENT" ? "Confirm & Register" : "Confirm & Play"}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <button
            onClick={onClose}
            disabled={isConfirming}
            className="w-full py-2 px-4 rounded-xl text-neutral-400 hover:text-neutral-200 text-sm font-medium transition disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
