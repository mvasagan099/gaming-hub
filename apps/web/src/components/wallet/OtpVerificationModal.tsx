import React, { useState, useRef, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck, RotateCcw, ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { WalletActionModal } from "./WalletActionModal";
import { cn } from "../../lib/utils";

export interface OtpVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void;
  onVerify: (otp: string) => Promise<void>;
  onResendOtp: () => Promise<boolean | void>;
  amount: number | string;
  currency?: string;
  destinationText?: string;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  initialCountdownSeconds?: number;
}

export const OtpVerificationModal: React.FC<OtpVerificationModalProps> = ({
  isOpen,
  onClose,
  onBack,
  onVerify,
  onResendOtp,
  amount,
  currency = "Coins",
  destinationText = "CouponVault Wallet",
  isSubmitting = false,
  errorMessage = null,
  initialCountdownSeconds = 60,
}) => {
  const reduceMotion = useReducedMotion();
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [resendCooldown, setResendCooldown] = useState<number>(initialCountdownSeconds);
  const [isResending, setIsResending] = useState(false);
  const [shouldShake, setShouldShake] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus first input when modal opens
  useEffect(() => {
    if (isOpen) {
      setDigits(["", "", "", "", "", ""]);
      setResendCooldown(initialCountdownSeconds);
      const timer = setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialCountdownSeconds]);

  // Resend countdown timer
  useEffect(() => {
    if (!isOpen || resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, resendCooldown]);

  // Shake animation trigger when an error occurs
  useEffect(() => {
    if (errorMessage) {
      setShouldShake(true);
      const t = setTimeout(() => setShouldShake(false), 500);
      return () => clearTimeout(t);
    }
  }, [errorMessage]);

  const handleDigitChange = (index: number, val: string) => {
    // Numeric only
    const clean = val.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }

    // Handle single digit entry
    const char = clean[clean.length - 1];
    const next = [...digits];
    next[index] = char;
    setDigits(next);

    // Auto advance to next input
    if (index < 5 && char) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        // Current is empty, backspace moves to previous
        const next = [...digits];
        next[index - 1] = "";
        setDigits(next);
        inputRefs.current[index - 1]?.focus();
      } else {
        const next = [...digits];
        next[index] = "";
        setDigits(next);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasteData) return;

    const next = [...digits];
    for (let i = 0; i < 6; i++) {
      next[i] = pasteData[i] || "";
    }
    setDigits(next);

    // Focus last filled box or 6th box
    const focusIndex = Math.min(pasteData.length, 5);
    inputRefs.current[focusIndex]?.focus();
  };

  const fullCode = digits.join("");
  const isComplete = fullCode.length === 6;

  const handleSubmit = async () => {
    if (!isComplete || isSubmitting) return;
    await onVerify(fullCode);
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    try {
      await onResendOtp();
      setResendCooldown(60);
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setIsResending(false);
    }
  };

  return (
    <WalletActionModal
      isOpen={isOpen}
      onClose={onClose}
      isProcessing={isSubmitting}
      title="Verify Withdrawal"
      description="We've sent a 6-digit verification code to your registered email."
      icon={<ShieldCheck className="w-6 h-6 text-emerald-400" />}
      maxWidth="md"
    >
      <div className="space-y-6 pt-2">
        {/* Context Summary Card */}
        <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between text-xs sm:text-sm">
          <div>
            <span className="text-slate-400 block text-[11px] font-bold uppercase tracking-wider">Withdrawing</span>
            <span className="text-white font-black text-base sm:text-lg">
              {amount} {currency}
            </span>
          </div>
          <div className="text-right">
            <span className="text-slate-400 block text-[11px] font-bold uppercase tracking-wider">Destination</span>
            <span className="text-slate-200 font-semibold">{destinationText}</span>
          </div>
        </div>

        {/* 6-Digit OTP Box Grid with Shake Animation */}
        <motion.div
          className="flex items-center justify-center gap-2 sm:gap-3 py-2"
          animate={
            shouldShake && !reduceMotion
              ? { x: [-10, 10, -8, 8, -4, 4, 0] }
              : { x: 0 }
          }
          transition={{ duration: 0.4 }}
        >
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              disabled={isSubmitting}
              className={cn(
                "w-11 h-14 sm:w-13 sm:h-16 text-center text-xl sm:text-2xl font-black rounded-2xl",
                "bg-slate-800/90 border border-slate-700 text-white",
                "focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500",
                "transition-all duration-150 shadow-inner",
                digit ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400" : "hover:border-slate-600",
                errorMessage && "border-rose-500/80 bg-rose-500/10 text-rose-300"
              )}
            />
          ))}
        </motion.div>

        {/* Error message indicator */}
        {errorMessage && (
          <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold px-2 justify-center">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Resend OTP Row */}
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-slate-400">Didn't receive the code?</span>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0 || isResending || isSubmitting}
            className={cn(
              "inline-flex items-center gap-1 font-bold transition-colors",
              resendCooldown > 0 || isResending || isSubmitting
                ? "text-slate-500 cursor-not-allowed"
                : "text-emerald-400 hover:text-emerald-300 hover:underline"
            )}
          >
            {isResending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            <span>
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
            </span>
          </button>
        </div>

        {/* Actions Button Row */}
        <div className="flex items-center gap-3 pt-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              disabled={isSubmitting}
              className="p-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 disabled:opacity-50"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isComplete || isSubmitting}
            className="flex-1 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base uppercase tracking-wide transition-all shadow-lg shadow-emerald-500/25 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <span>Verify & Withdraw</span>
            )}
          </button>
        </div>
      </div>
    </WalletActionModal>
  );
};
