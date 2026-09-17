import React, { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Copy, CheckCheck, Sparkles, ArrowRight } from "lucide-react";
import confetti from "canvas-confetti";
import toast from "react-hot-toast";
import { cn } from "../../lib/utils";

export interface WalletSuccessAnimationProps {
  title: string;
  subtitle?: string;
  amount: number | string;
  currency?: string;
  prefix?: string;
  newBalance?: number | string;
  transactionId?: string;
  onDone: () => void;
  onViewTransactions?: () => void;
  viewTransactionsLabel?: string;
  className?: string;
}

export const WalletSuccessAnimation: React.FC<WalletSuccessAnimationProps> = ({
  title,
  subtitle,
  amount,
  currency = "Coins",
  prefix = "+",
  newBalance,
  transactionId,
  onDone,
  onViewTransactions,
  viewTransactionsLabel = "View Transactions",
  className,
}) => {
  const reduceMotion = useReducedMotion();
  const [copied, setCopied] = React.useState(false);

  // Trigger gentle, controlled confetti burst on mount
  useEffect(() => {
    if (!reduceMotion) {
      try {
        confetti({
          particleCount: 36,
          spread: 60,
          origin: { y: 0.62 },
          colors: ["#10b981", "#f59e0b", "#3b82f6", "#ffffff"],
          ticks: 160,
          gravity: 1.1,
          scalar: 0.9,
        });
      } catch {
        // Fallback gracefully if canvas context unavailable
      }
    }
  }, [reduceMotion]);

  const handleCopyId = () => {
    if (!transactionId) return;
    navigator.clipboard.writeText(transactionId);
    setCopied(true);
    toast.success("Transaction ID copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // Format amount with currency symbol or code cleanly
  const formattedAmount = typeof amount === "number" ? amount.toLocaleString() : amount;
  const formattedBalance = typeof newBalance === "number" ? newBalance.toLocaleString() : newBalance;

  return (
    <div className={cn("flex flex-col items-center text-center py-4 px-2", className)}>
      {/* Animated Checkmark Badge with Radiant Emerald Glow */}
      <div className="relative mb-5 flex items-center justify-center">
        {/* Outer Glow Halo */}
        <motion.div
          className="absolute w-28 h-28 rounded-full bg-emerald-500/25 blur-2xl pointer-events-none"
          initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: [0.9, 1.2, 1], opacity: [0.4, 0.8, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Central Success Disc */}
        <motion.div
          className="relative w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-xl shadow-emerald-500/30 flex items-center justify-center"
          initial={reduceMotion ? false : { scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 18 }}
        >
          <div className="w-full h-full rounded-[1.4rem] bg-slate-950/40 backdrop-blur-sm flex items-center justify-center">
            <Check className="w-10 h-10 text-white stroke-[3.5]" />
          </div>
        </motion.div>
      </div>

      {/* Title */}
      <motion.h3
        className="text-2xl sm:text-3xl font-black text-white tracking-tight"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
      >
        {title}
      </motion.h3>

      {/* Subtitle / Context */}
      {subtitle && (
        <motion.p
          className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xs"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.18 }}
        >
          {subtitle}
        </motion.p>
      )}

      {/* Amount Display Highlight Card */}
      <motion.div
        className="w-full max-w-sm my-5 p-5 rounded-2xl bg-gradient-to-b from-slate-800/80 to-slate-900/90 border border-slate-700/60 shadow-inner"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.22 }}
      >
        <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400 flex items-center justify-center gap-1 mb-1">
          <Sparkles className="w-3.5 h-3.5" /> Amount Settled
        </span>
        <div className="flex items-center justify-center gap-1.5 text-3xl sm:text-4xl font-black text-white tracking-tight">
          <span className="text-emerald-400">{prefix}</span>
          <span>{formattedAmount}</span>
          <span className="text-lg sm:text-xl font-bold text-slate-300 ml-1">{currency}</span>
        </div>

        {/* New balance row if provided */}
        {newBalance !== undefined && (
          <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between text-xs sm:text-sm">
            <span className="text-slate-400 font-medium">New MAIN Balance:</span>
            <span className="text-white font-black tracking-wide">
              {formattedBalance} {currency}
            </span>
          </div>
        )}

        {/* Transaction Reference ID if provided */}
        {transactionId && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-700/40 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Ref ID:</span>
            <button
              onClick={handleCopyId}
              type="button"
              className="inline-flex items-center gap-1.5 font-mono text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-800 px-2 py-1 rounded-lg border border-slate-700 transition-colors"
              title="Click to copy Transaction ID"
            >
              <span className="truncate max-w-[150px]">{transactionId}</span>
              {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            </button>
          </div>
        )}
      </motion.div>

      {/* Action Buttons */}
      <div className="w-full max-w-sm flex flex-col sm:flex-row items-center gap-3 pt-2">
        <button
          onClick={onDone}
          type="button"
          className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm uppercase tracking-wide shadow-lg shadow-emerald-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200"
        >
          Done
        </button>

        {onViewTransactions && (
          <button
            onClick={onViewTransactions}
            type="button"
            className="w-full py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700/90 text-slate-200 hover:text-white font-bold text-sm transition-all flex items-center justify-center gap-1.5 border border-slate-700"
          >
            <span>{viewTransactionsLabel}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
