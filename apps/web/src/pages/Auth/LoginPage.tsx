import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  LogIn,
  Mail,
  Lock,
  Loader2,
  Wrench,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react";
import { supabase } from "../../services/supabase";
import { getAuthErrorMessage, logAuthError } from "../../lib/authErrors";
import { apiClient } from "../../services/api/client";
import { AuthLayout } from "./AuthLayout";
import { useSettingsStore } from "../../store/settingsStore";
import { useAuthStore } from "../../store/authStore";

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

  // Step 1: Credentials
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const maintenanceEnabled = settings?.general?.maintenanceEnabled ?? false;
  const maintenanceMessage = settings?.general?.maintenanceMessage ?? "";

  // If redirected here with require2FA flag, forward straight to /2fa
  useEffect(() => {
    if (locationState?.require2FA) {
      useAuthStore.getState().setIsMfaRequired(true);
      navigate("/2fa", {
        replace: true,
        state: { from: locationState.from, next: locationState.next },
      });
    }
  }, [locationState, navigate]);

  // Navigate after fully completing login
  const finishLoginNavigation = async (session: import("@supabase/supabase-js").Session) => {
    const status = await useAuthStore.getState().verifySession(session);
    if (status !== 'authenticated') {
      if (status === 'mfa_pending') navigate('/2fa', { replace: true });
      return;
    }

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
      // Fallback
    }

    toast.success("Welcome back!");
    navigate("/", { replace: true });
  };

  // ── Step 1: Submit email + password ───────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error("Enter your email"); return; }
    if (!password) { toast.error("Enter your password"); return; }

    setSubmitting(true);
    try {
      // ── Flag MFA as required BEFORE signInWithPassword so that the
      //    Supabase onAuthStateChange SIGNED_IN handler in App.tsx can detect
      //    it and park the session in pendingMfaSession instead of session.
      //    We flip it back to false if backend says no 2FA required.
      useAuthStore.getState().setIsMfaRequired(true);

      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        useAuthStore.getState().setIsMfaRequired(false);
        logAuthError("LoginPassword", error);
        toast.error(getAuthErrorMessage(error));
        return;
      }

      const supabaseSession =
        signInData?.session ?? (await supabase.auth.getSession()).data.session;

      if (!supabaseSession) throw new Error('Authentication session could not be established');
      const status = await useAuthStore.getState().verifySession(supabaseSession);
      if (status === 'superseded') return;
      const requiresTwoFactor = status === 'mfa_pending';

      if (requiresTwoFactor) {
        // isMfaRequired was already set true above; App.tsx already stored
        // the session in pendingMfaSession via the SIGNED_IN handler.
        // If it hasn't fired yet (race), set it explicitly here too.
        useAuthStore.getState().setIsMfaRequired(true);
        if (!useAuthStore.getState().pendingMfaSession) {
          useAuthStore.getState().setPendingMfaSession(supabaseSession);
        }
        try {
          sessionStorage.setItem("mfa_pending", "true");
          if (email) sessionStorage.setItem("mfa_email", email.trim());
        } catch {
          // ignore storage quota / sandbox errors
        }
        // Navigate to dedicated 2FA page, passing along any redirect info
        navigate("/2fa", {
          replace: true,
          state: { from, next: locationState?.next, email: email.trim() },
        });
        return;
      }

      // No 2FA required — complete login normally
      useAuthStore.getState().setIsMfaRequired(false);
      useAuthStore.getState().setPendingMfaSession(null);
      await finishLoginNavigation(supabaseSession);
    } catch (err) {
      useAuthStore.getState().setIsMfaRequired(false);
      logAuthError("Login", err);
      toast.error(getAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Maintenance Mode ──────────────────────────────────────────────────────
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
      title="Welcome back"
      subtitle="Log in to access your profile, wallet and matches"
    >
      <div className="space-y-4">
        {isSessionRevoked && (
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
          <motion.div
            key="credentials"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
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

              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white rounded-xl pl-10 pr-10 py-3 border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

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
                {submitting ? "Signing in…" : "LOG IN"}
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
        </AnimatePresence>
      </div>
    </AuthLayout>
  );
}
