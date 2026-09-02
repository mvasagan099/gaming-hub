import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Lock, Loader2, KeyRound, Eye, EyeOff, AlertCircle } from "lucide-react";
import { supabase } from "../../services/supabase";
import { useAuthStore } from "../../store/authStore";
import { getAuthErrorMessage, logAuthError } from "../../lib/authErrors";
import { AuthLayout } from "./AuthLayout";
import { FullPageLoader } from "../../components/auth/ProtectedRoute";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const isLoading = useAuthStore((s) => s.isLoading);
  const isPasswordRecovery = useAuthStore((s) => s.isPasswordRecovery);
  const recoverySession = useAuthStore((s) => s.recoverySession);
  const setIsPasswordRecovery = useAuthStore((s) => s.setIsPasswordRecovery);
  const setRecoverySession = useAuthStore((s) => s.setRecoverySession);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasValidToken, setHasValidToken] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkAuthContext() {
      const hash = typeof window !== "undefined" ? window.location.hash || "" : "";
      const search = typeof window !== "undefined" ? window.location.search || "" : "";
      const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.substring(1) : hash);
      const searchParams = new URLSearchParams(search);

      // Check for error parameters in URL hash or query string (e.g. expired link)
      if (hashParams.get("error") || searchParams.get("error") || hashParams.get("error_description") || searchParams.get("error_description")) {
        if (mounted) {
          setIsPasswordRecovery(false);
          setRecoverySession(null);
          setHasValidToken(false);
        }
        return;
      }

      // If PKCE code is present in query parameters, exchange it for a session if needed
      const code = searchParams.get("code");
      if (code) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error && data?.session && mounted) {
            setIsPasswordRecovery(true);
            setRecoverySession(data.session);
            setHasValidToken(true);
            return;
          }
        } catch {
          // Fall through to getSession check
        }
      }

      // Check current session from Supabase
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      const hasRecoveryTokens =
        hash.includes("type=recovery") ||
        search.includes("type=recovery") ||
        hash.includes("access_token") ||
        Boolean(recoverySession || isPasswordRecovery);

      if (session && (hasRecoveryTokens || isPasswordRecovery)) {
        setIsPasswordRecovery(true);
        setRecoverySession(session);
        setHasValidToken(true);
      } else if (recoverySession) {
        setHasValidToken(true);
      } else if (session) {
        // Fallback: If user arrived with an active session on /reset-password, treat as recovery
        setIsPasswordRecovery(true);
        setRecoverySession(session);
        setHasValidToken(true);
      } else if (!hash && !search) {
        // Direct navigation with no tokens/session
        setHasValidToken(false);
      }
    }

    void checkAuthContext();

    // Fallback: If after 3.5 seconds hasValidToken is still unconfirmed and no session exists, mark invalid
    const fallbackTimer = setTimeout(() => {
      if (mounted && hasValidToken === null && !useAuthStore.getState().recoverySession && !useAuthStore.getState().session) {
        setHasValidToken(false);
      }
    }, 3500);

    // Also subscribe to auth state changes to capture PASSWORD_RECOVERY or SIGNED_IN events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setIsPasswordRecovery(true);
        setRecoverySession(session);
        setHasValidToken(true);
      } else if (event === "SIGNED_OUT") {
        setHasValidToken(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, [isPasswordRecovery, recoverySession, setIsPasswordRecovery, setRecoverySession]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      toast.error("Password is required");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        logAuthError("ResetPassword", error);
        toast.error(getAuthErrorMessage(error));
        return;
      }

      // Invalidate recovery authorization and clear all session state
      await supabase.auth.signOut();
      useAuthStore.getState().setSession(null);
      useAuthStore.getState().setUser(null);
      useAuthStore.getState().setIsPasswordRecovery(false);
      useAuthStore.getState().setRecoverySession(null);

      toast.success("Password updated successfully. You can now sign in.");
      navigate("/login", { replace: true });
    } catch (err) {
      logAuthError("ResetPassword", err);
      toast.error(getAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || hasValidToken === null) return <FullPageLoader />;

  if (!hasValidToken) {
    return (
      <AuthLayout title="Invalid or Expired Link" subtitle="Password reset link is invalid or expired">
        <div className="text-center space-y-4 py-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-rose-400" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Password reset link is invalid or expired. Please request a new password reset email.
          </p>
          <Link
            to="/forgot-password"
            className="inline-block px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors"
          >
            Request a new reset link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Enter a fresh password for your account">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="New password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white rounded-xl pl-10 pr-10 py-3 border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-200"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <div className="relative">
          <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
          <input
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white rounded-xl pl-10 pr-10 py-3 border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-200"
            aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
          >
            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          {submitting ? "Updating…" : "UPDATE PASSWORD"}
        </button>
      </form>
    </AuthLayout>
  );
}
