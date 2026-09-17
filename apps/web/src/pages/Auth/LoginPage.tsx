import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  LogIn,
  Mail,
  Lock,
  Sparkles,
  Loader2,
  Wrench,
  AlertTriangle,
  ShieldCheck,
  ArrowLeft,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../../services/supabase";
import { getAuthRedirectUrl } from "../../lib/authUtils";
import { getAuthErrorMessage, logAuthError } from "../../lib/authErrors";
import { apiClient } from "../../services/api/client";
import { twoFactorApi } from "../../services/api/twoFactor";
import { AuthLayout } from "./AuthLayout";
import { useSettingsStore } from "../../store/settingsStore";
import { useAuthStore } from "../../store/authStore";
import { cn } from "../../lib/utils";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as {
    from?: { pathname?: string; state?: unknown };
    require2FA?: boolean;
    userId?: string;
    next?: string;
  } | null;
  const from = locationState?.from;
  const settings = useSettingsStore((s) => s.settings);

  const isSessionRevoked = new URLSearchParams(location.search).get("reason") === "session_revoked";

  // Form credentials state (Step 1)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [useMagicLink, setUseMagicLink] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Authentication Flow step: "credentials" or "2fa"
  const [step, setStep] = useState<"credentials" | "2fa">(
    locationState?.require2FA ? "2fa" : "credentials"
  );
  const [pendingUserId, setPendingUserId] = useState<string | undefined>(locationState?.userId);

  // 6-digit OTP state (Step 2)
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [shouldShake, setShouldShake] = useState(false);

  const maintenanceEnabled = settings?.general?.maintenanceEnabled ?? false;
  const maintenanceMessage = settings?.general?.maintenanceMessage ?? "";

  // If redirected with require2FA, switch immediately to 2FA challenge
  useEffect(() => {
    if (locationState?.require2FA) {
      setStep("2fa");
      useAuthStore.getState().setIsMfaRequired(true);
      if (locationState.userId) {
        setPendingUserId(locationState.userId);
      }
    }
  }, [locationState]);

  // Auto-focus first digit input when entering Step 2
  useEffect(() => {
    if (step === "2fa") {
      const timer = setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const finishLoginNavigation = async () => {
    useAuthStore.getState().setIsMfaRequired(false);
    const target = locationState?.next || from?.pathname;
    if (target) {
      navigate(target, { replace: true, state: from?.state });
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
      // Fallback to default
    }

    toast.success("Welcome back!");
    navigate("/", { replace: true });
  };

  // 6-Digit OTP Handlers
  const handleDigitChange = (index: number, val: string) => {
    setErrorMessage("");
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

    // Auto advance to next input box
    if (index < 5 && char) {
      inputRefs.current[index + 1]?.focus();
    }
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
      if (code.length === 6 && !submitting) {
        handleVerify2FACode(code);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setErrorMessage("");
    const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasteData) return;

    const next = [...digits];
    for (let i = 0; i < 6; i++) {
      next[i] = pasteData[i] || "";
    }
    setDigits(next);

    const focusIndex = Math.min(pasteData.length, 5);
    inputRefs.current[focusIndex]?.focus();
  };

  const handleVerify2FACode = async (codeOverride?: string) => {
    const fullCode = (codeOverride ?? digits.join("")).trim();
    if (fullCode.length !== 6) {
      setErrorMessage("Please enter all 6 digits of your authenticator code.");
      setShouldShake(true);
      setTimeout(() => setShouldShake(false), 500);
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const session = useAuthStore.getState().session;
      if (session?.access_token) {
        await twoFactorApi.verifySession(fullCode);
      } else if (pendingUserId) {
        await twoFactorApi.verifyLogin(pendingUserId, fullCode);
      } else {
        await twoFactorApi.verifySession(fullCode);
      }

      toast.success("2FA verified!");
      await finishLoginNavigation();
    } catch (err) {
      logAuthError("Login2FAVerify", err);
      setErrorMessage("Invalid authentication code. Please try again.");
      setShouldShake(true);
      setTimeout(() => setShouldShake(false), 500);
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackToLogin = async () => {
    setSubmitting(true);
    try {
      await useAuthStore.getState().signOut();
    } catch {
      // Ignore network errors on sign out
    } finally {
      useAuthStore.getState().setIsMfaRequired(false);
      setStep("credentials");
      setDigits(["", "", "", "", "", ""]);
      setErrorMessage("");
      setSubmitting(false);
    }
  };

  // Step 1: Initial Login Submit (Email + Password)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Enter your email");
      return;
    }
    if (!useMagicLink && !password) {
      toast.error("Enter your password");
      return;
    }

    setSubmitting(true);
    try {
      if (useMagicLink) {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: getAuthRedirectUrl("/auth/callback") },
        });
        if (error) {
          logAuthError("LoginMagicLink", error);
          toast.error(getAuthErrorMessage(error));
          return;
        }
        toast.success("Magic link sent — check your inbox");
        return;
      }

      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        logAuthError("LoginPassword", error);
        toast.error(getAuthErrorMessage(error));
        if (
          /invalid login credentials/i.test(error.message) ||
          error.message.toLowerCase().includes("invalid_credentials")
        ) {
          setUseMagicLink(true);
        }
        return;
      }

      const session = signInData?.session ?? (await supabase.auth.getSession()).data.session;
      if (!session) {
        await finishLoginNavigation();
        return;
      }

      let requiresTwoFactor = false;
      let returnedUserId: string | undefined;

      try {
        const result = await apiClient.post<{
          status: string;
          requiresTwoFactor?: boolean;
          userId?: string;
          challengeId?: string;
        }>(
          "/auth/session",
          { token: session.access_token },
          session.access_token
        );

        if (
          result.requiresTwoFactor ||
          result.status === "mfa_required" ||
          result.status === "2fa_required"
        ) {
          requiresTwoFactor = true;
          returnedUserId = result.userId || result.challengeId;
        }
      } catch (sessionErr) {
        console.error("Backend auth session check failed", sessionErr);
      }

      if (requiresTwoFactor) {
        useAuthStore.getState().setIsMfaRequired(true);
        setPendingUserId(returnedUserId || session.user?.id);
        setStep("2fa");
        setDigits(["", "", "", "", "", ""]);
        setErrorMessage("");
        return;
      }

      useAuthStore.getState().setIsMfaRequired(false);
      await finishLoginNavigation();
    } catch (err) {
      logAuthError("Login", err);
      toast.error(getAuthErrorMessage(err));
      if (err instanceof Error && /invalid login credentials/i.test(err.message)) {
        setUseMagicLink(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (maintenanceEnabled) {
    return (
      <AuthLayout
        title="Under Maintenance"
        subtitle="We're working hard to improve the experience"
      >
        <div className="text-center space-y-4 py-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <Wrench className="w-7 h-7 text-amber-400" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {maintenanceMessage || "We are performing scheduled maintenance. Please check back soon."}
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={step === "2fa" ? "Two-Factor Authentication" : "Welcome back"}
      subtitle={
        step === "2fa"
          ? "Enter the 6-digit code from your authenticator app."
          : "Log in to access your profile, wallet and matches"
      }
    >
      <div className="space-y-4">
        {isSessionRevoked && step !== "2fa" && (
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
            <div>
              <p className="font-bold text-sm text-slate-900 dark:text-white">
                Your account was signed in on another device.
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Please sign in again to continue on this device.
              </p>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === "2fa" ? (
            /* ==================================================
               STEP 2: TWO-FACTOR AUTHENTICATION CHALLENGE
               ================================================== */
            <motion.div
              key="2fa"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-center space-y-1.5">
                <div className="w-9 h-9 mx-auto rounded-xl bg-indigo-500/20 text-indigo-500 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Two-Factor Authentication is active for this account.
                </p>
                {email && (
                  <p className="text-[11px] font-mono text-indigo-500 dark:text-indigo-400 font-bold truncate">
                    {email}
                  </p>
                )}
              </div>

              {/* 6 Individual Digit OTP Boxes with Shake Animation */}
              <div className="space-y-2">
                <motion.div
                  className="flex items-center justify-center gap-2 sm:gap-2.5 py-1"
                  animate={shouldShake ? { x: [-10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
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
                      disabled={submitting}
                      className={cn(
                        "w-11 h-13 sm:w-12 sm:h-15 text-center text-xl sm:text-2xl font-black rounded-xl",
                        "bg-white dark:bg-slate-950 border text-slate-900 dark:text-white",
                        "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500",
                        "transition-all duration-150 shadow-sm font-mono",
                        digit
                          ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                          : "border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700",
                        errorMessage && "border-rose-500/80 bg-rose-500/10 text-rose-500"
                      )}
                    />
                  ))}
                </motion.div>

                {errorMessage && (
                  <div className="flex items-center gap-1.5 text-rose-500 text-xs font-semibold justify-center pt-1 animate-in fade-in duration-150">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleVerify2FACode()}
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
                onClick={handleBackToLogin}
                disabled={submitting}
                className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 text-xs font-bold text-slate-600 dark:text-slate-400 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to login
              </button>
            </motion.div>
          ) : (
            /* ==================================================
               STEP 1: INITIAL LOGIN FORM (EMAIL + PASSWORD ONLY)
               ================================================== */
            <motion.div
              key="credentials"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white rounded-xl pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                {!useMagicLink && (
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input
                      type="password"
                      autoComplete="current-password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white rounded-xl pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  {submitting ? "Signing in…" : useMagicLink ? "Send magic link" : "LOG IN"}
                </button>

                <button
                  type="button"
                  onClick={() => setUseMagicLink((v) => !v)}
                  className="w-full flex items-center justify-center gap-2 text-xs font-bold text-indigo-500 hover:text-indigo-400 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {useMagicLink ? "Use email & password instead" : "Send me a magic link instead"}
                </button>
              </form>

              <div className="pt-5 mt-5 border-t border-slate-200 dark:border-slate-800 space-y-2 text-center">
                <div className="flex items-center justify-center gap-4 text-xs font-bold">
                  <Link
                    to="/forgot-password"
                    className="text-slate-500 dark:text-slate-400 hover:text-indigo-400 transition-colors"
                  >
                    Forgot password?
                  </Link>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <Link
                    to="/signup"
                    className="text-indigo-500 hover:text-indigo-400 transition-colors"
                  >
                    Create an account
                  </Link>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  Multiplayer matches are tied to your account — sign in to play online.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AuthLayout>
  );
}
