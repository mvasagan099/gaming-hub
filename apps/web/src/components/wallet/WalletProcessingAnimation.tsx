import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Ticket, Wallet, ShieldCheck, ArrowRight, Sparkles, Coins } from "lucide-react";
import { cn } from "../../lib/utils";

export interface WalletProcessingAnimationProps {
  flow: "redeem" | "withdraw";
  customMessages?: string[];
  subtext?: string;
  className?: string;
}

const REDEEM_MESSAGES = [
  "Verifying coupon...",
  "Redeeming securely with CouponVault...",
  "Updating your MAIN wallet balance...",
];

const WITHDRAW_MESSAGES = [
  "Securing your withdrawal request...",
  "Sending transfer to CouponVault...",
  "Confirming wallet transfer status...",
];

export const WalletProcessingAnimation: React.FC<WalletProcessingAnimationProps> = ({
  flow,
  customMessages,
  subtext,
  className,
}) => {
  const reduceMotion = useReducedMotion();
  const messages = customMessages || (flow === "redeem" ? REDEEM_MESSAGES : WITHDRAW_MESSAGES);
  const [currentMsgIndex, setCurrentMsgIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMsgIndex((prev) => (prev + 1) % messages.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [messages.length]);

  const isRedeem = flow === "redeem";

  return (
    <div className={cn("flex flex-col items-center justify-center py-6 px-4 text-center select-none", className)}>
      {/* Central Visual Flow Stage */}
      <div className="relative w-full max-w-xs h-32 flex items-center justify-between px-4 mb-6">
        {/* Ambient Glow */}
        <div
          className={cn(
            "absolute inset-0 m-auto w-44 h-44 rounded-full blur-3xl pointer-events-none opacity-40",
            isRedeem ? "bg-amber-500/30" : "bg-blue-500/30"
          )}
        />

        {/* Source Icon Node */}
        <div className="relative z-10 flex flex-col items-center gap-1.5">
          <motion.div
            className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center border shadow-lg relative",
              isRedeem
                ? "bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-amber-500/20"
                : "bg-blue-500/15 border-blue-500/40 text-blue-400 shadow-blue-500/20"
            )}
            animate={
              reduceMotion
                ? undefined
                : {
                    scale: [1, 1.05, 1],
                    borderColor: isRedeem
                      ? ["rgba(245,158,11,0.3)", "rgba(245,158,11,0.8)", "rgba(245,158,11,0.3)"]
                      : ["rgba(59,130,246,0.3)", "rgba(59,130,246,0.8)", "rgba(59,130,246,0.3)"],
                  }
            }
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            {isRedeem ? <Ticket className="w-7 h-7" /> : <Wallet className="w-7 h-7" />}
          </motion.div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {isRedeem ? "Coupon" : "MAIN Wallet"}
          </span>
        </div>

        {/* Animated Energy Channel / Travelling Particle */}
        <div className="flex-1 mx-3 relative flex items-center justify-center">
          {/* Base Track Line */}
          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden relative">
            <motion.div
              className={cn(
                "h-full w-1/3 rounded-full",
                isRedeem
                  ? "bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.8)]"
                  : "bg-gradient-to-r from-blue-500 via-indigo-300 to-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]"
              )}
              animate={
                reduceMotion
                  ? undefined
                  : {
                      x: ["-100%", "300%"],
                    }
              }
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>

          {/* Central Pulsing Shield / Sparkle Indicator */}
          <motion.div
            className="absolute p-1.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300 shadow-md"
            animate={reduceMotion ? undefined : { scale: [0.95, 1.1, 0.95] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            {isRedeem ? (
              <Coins className="w-4 h-4 text-amber-400" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            )}
          </motion.div>
        </div>

        {/* Destination Icon Node */}
        <div className="relative z-10 flex flex-col items-center gap-1.5">
          <motion.div
            className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center border shadow-lg relative",
              isRedeem
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-emerald-500/20"
                : "bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-amber-500/20"
            )}
            animate={
              reduceMotion
                ? undefined
                : {
                    scale: [1, 1.05, 1],
                  }
            }
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          >
            {isRedeem ? <Wallet className="w-7 h-7" /> : <Ticket className="w-7 h-7" />}
          </motion.div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {isRedeem ? "MAIN Wallet" : "CouponVault"}
          </span>
        </div>
      </div>

      {/* Rotating Progress Ring Indicator */}
      <div className="relative w-12 h-12 mb-4 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90 animate-spin" viewBox="0 0 36 36">
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            className="stroke-slate-800"
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            strokeDasharray="94.2"
            strokeDashoffset="60"
            strokeLinecap="round"
            className={isRedeem ? "stroke-amber-400" : "stroke-blue-400"}
            strokeWidth="3"
          />
        </svg>
        <Sparkles className={cn("w-4 h-4 absolute", isRedeem ? "text-amber-400" : "text-blue-400")} />
      </div>

      {/* Cross-fading State Text */}
      <div className="h-8 relative flex items-center justify-center w-full px-4 overflow-hidden">
        <motion.p
          key={currentMsgIndex}
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="text-base font-black text-white tracking-wide"
        >
          {messages[currentMsgIndex]}
        </motion.p>
      </div>

      {/* Subtext info */}
      <p className="mt-2 text-xs text-slate-400 max-w-xs leading-relaxed">
        {subtext || "Please keep this window open while the transaction is securely recorded on the ledger."}
      </p>

      {/* Indeterminate Bottom Glow Bar */}
      <div className="w-48 h-1 bg-slate-800 rounded-full mt-6 overflow-hidden relative">
        <motion.div
          className={cn(
            "h-full w-20 rounded-full",
            isRedeem ? "bg-amber-400 shadow-[0_0_10px_#f59e0b]" : "bg-blue-400 shadow-[0_0_10px_#3b82f6]"
          )}
          animate={reduceMotion ? undefined : { x: ["-80px", "200px"] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
};
