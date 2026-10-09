import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Loader2,
  ArrowLeft,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../../services/supabase";
import { twoFactorApi } from "../../services/api/twoFactor";
import { apiClient } from "../../services/api/client";
import { useAuthStore } from "../../store/authStore";
import { logAuthError } from "../../lib/authErrors";
import { AuthLayout } from "./AuthLayout";
import { cn } from "../../lib/utils";

export function TwoFactorPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const stateObj = location.state as {
    email?: string;
    from?: { pathname?: string; state?: unknown };
    next?: string;
  } | null;

  const email = stateObj?.email ?? "";

  // OTP digit boxes
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [mfaError, setMfaError] = useState("");
  const [shouldShake, setShouldShake] = useState(false);

  // Guard: if there's no pending MFA session and session restoration is done, redirect back to login
  const pendingMfaSession = useAuthStore((s) => s.pendingMfaSession);
  const isLoading = useAuthStore((s) => s.isLoading);
  useEffect(() => {
    if (!isLoading && !pendingMfaSession) {
      navigate("/login", { replace: true });
    }
  }, [isLoading, pendingMfaSession, navigate]);

  // Auto-focus first box on mount
  useEffect(() => {
    const t = setTimeout(() => inputRefs.current[0]?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  // ── Navigate after completing login ──────────────────────────────────────
  const finishLoginNavigation = async (session: import("@supabase/supabase-js").Session) => {
    try {
      sessionStorage.removeItem("mfa_pending");
      sessionStorage.removeItem("mfa_email");
    } catch {
      // ignore
    }
    const status = await useAuthStore.getState().verifySession(session);
    if (status !== 'authenticated') throw new Error('Application session has not completed verification');

    const target = stateObj?.next || stateObj?.from?.pathname;
    if (target) {
      navigate(target, { replace: true, state: stateObj?.from?.state });
      return;
    }

    try {
      const meData = await apiClient.get<{ user: { role: string } }>("/auth/me");
      if (meData?.user?.role === "ADMIN") {
        toast.success("Welcome Admin!");
        navigate("/admin", { replace: true });
        return;
      }
    } catch {
      // Fallback
    }

    toast.success("Welcome back!");
    navigate("/", { replace: true });
  };

  // ── OTP digit handlers ────────────────────────────────────────────────────
  const handleDigitChange = (index: number, val: string) => {
    setMfaError("");
    const clean = val.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }
    const char = clean[clean.length - 1];
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    if (index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
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
    } else if (e.key === "Enter") {
      e.preventDefault();
      const code = digits.join("");
      if (code.length === 6 && !submitting) void handleVerify(code);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setMfaError("");
    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!paste) return;
    const next = [...digits];
    for (let i = 0; i < 6; i++) next[i] = paste[i] || "";
    setDigits(next);
    inputRefs.current[Math.min(paste.length, 5)]?.focus();
  };

  // ── Verify TOTP ───────────────────────────────────────────────────────────
  const handleVerify = async (codeOverride?: string) => {
    const code = (codeOverride ?? digits.join("")).trim();
    if (code.length !== 6) {
      setMfaError("Please enter all 6 digits.");
      setShouldShake(true);
      setTimeout(() => setShouldShake(false), 500);
      return;
    }

    const session = useAuthStore.getState().pendingMfaSession;
    const bearerToken = session?.access_token;

    if (!bearerToken || !session) {
      toast.error("Session expired. Please log in again.");
      navigate("/login", { replace: true });
      return;
    }

    setSubmitting(true);
    setMfaError("");
    try {
      await twoFactorApi.verifyLoginTimeTotp(code, bearerToken);
      toast.success("2FA verified!");
      await finishLoginNavigation(session);
    } catch (err) {
      logAuthError("TwoFactorPageVerify", err);
      setMfaError("Invalid authentication code. Please try again.");
      setShouldShake(true);
      setTimeout(() => setShouldShake(false), 500);
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  // ── Back to login ─────────────────────────────────────────────────────────
  const handleBack = async () => {
    setSubmitting(true);
    try {
      sessionStorage.removeItem("mfa_pending");
      sessionStorage.removeItem("mfa_email");
      await supabase.auth.signOut();
    } catch {
      // ignore
    } finally {
      useAuthStore.getState().setPendingMfaSession(null);
      useAuthStore.getState().setIsMfaRequired(false);
      navigate("/login", { replace: true });
    }
  };

  return (
    <AuthLayout
      title="Two-Factor Authentication"
      subtitle="Enter the 6-digit code from your authenticator app."
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="space-y-5"
      >
        {/* Account badge */}
        <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-center space-y-1.5">
          <div className="w-9 h-9 mx-auto rounded-xl bg-indigo-500/20 text-indigo-500 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Two-Factor Authentication is enabled for this account.
          </p>
          {email && (
            <p className="text-[11px] font-mono text-indigo-500 dark:text-indigo-400 font-bold truncate">
              {email}
            </p>
          )}
        </div>

        {/* 6-box OTP grid */}
        <div className="space-y-2">
          <motion.div
            className="flex items-center justify-center gap-2 sm:gap-2.5 py-1"
            animate={shouldShake ? { x: [-10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
            transition={{ duration: 0.4 }}
          >
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                disabled={submitting}
                className={cn(
                  "w-11 h-13 sm:w-12 sm:h-15 text-center text-xl sm:text-2xl font-black rounded-xl",
                  "bg-white dark:bg-slate-950 border text-slate-900 dark:text-white",
                  "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500",
                  "transition-all duration-150 shadow-sm font-mono",
                  digit
                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                    : "border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700",
                  mfaError && "border-rose-500/80 bg-rose-500/10 text-rose-500"
                )}
              />
            ))}
          </motion.div>

          {mfaError && (
            <div className="flex items-center gap-1.5 text-rose-500 text-xs font-semibold justify-center pt-1 animate-in fade-in duration-150">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{mfaError}</span>
            </div>
          )}
        </div>

        <button
          type="button"
          id="2fa-verify-btn"
          onClick={() => void handleVerify()}
          disabled={submitting || digits.join("").length !== 6}
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ShieldCheck className="w-4 h-4" />
          )}
          {submitting ? "Verifying…" : "VERIFY & CONTINUE"}
        </button>

        <button
          type="button"
          id="2fa-back-btn"
          onClick={() => void handleBack()}
          disabled={submitting}
          className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 text-xs font-bold text-slate-600 dark:text-slate-400 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to login
        </button>

        <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 pt-1">
          Enter the 6-digit code from Google Authenticator or a similar app.
        </p>
      </motion.div>
    </AuthLayout>
  );
}
