import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Lock, Loader2, KeyRound, Eye, EyeOff, AlertCircle } from "lucide-react";
import { supabase } from "../../services/supabase";
import { useAuthStore } from "../../store/authStore";
import { AuthLayout } from "./AuthLayout";
import { FullPageLoader } from "../../components/auth/ProtectedRoute";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const isLoading = useAuthStore((s) => s.isLoading);
  const isPasswordRecovery = useAuthStore((s) => s.isPasswordRecovery);
  const recoverySession = useAuthStore((s) => s.recoverySession);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasValidToken, setHasValidToken] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    const checkRecovery = async () => {
      try {
        const url = new URL(window.location.href);
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
        const searchParams = url.searchParams;

        const error =
          searchParams.get("error") ||
          hashParams.get("error") ||
          searchParams.get("error_description") ||
          hashParams.get("error_description");

        if (error) {
          if (active) setHasValidToken(false);
          return;
        }

        // Normally AuthCallbackPage handles ?code= links. This fallback keeps
        // direct /reset-password links working too.
        const code = searchParams.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const recovery =
          hashParams.get("type") === "recovery" ||
          searchParams.get("type") === "recovery" ||
          isPasswordRecovery;

        if (data.session && recovery) {
          useAuthStore.getState().setIsPasswordRecovery(true);
          useAuthStore.getState().setRecoverySession(data.session);
          if (active) setHasValidToken(true);
          return;
        }

        if (recoverySession && isPasswordRecovery) {
          if (active) setHasValidToken(true);
          return;
        }

        if (active) setHasValidToken(false);
      } catch (err) {
        console.error("Password recovery initialization failed:", err);
        if (active) setHasValidToken(false);
      } finally {
        if (active) setChecking(false);
      }
    };

    void checkRecovery();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === "PASSWORD_RECOVERY" && session) {
        useAuthStore.getState().setIsPasswordRecovery(true);
        useAuthStore.getState().setRecoverySession(session);
        setHasValidToken(true);
        setChecking(false);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [isPasswordRecovery, recoverySession]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      // Supabase must have the recovery session established before this call.
      const { data: current, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!current.session) {
        throw new Error("Password recovery session is missing or expired. Request a new reset link.");
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Force the user to sign in again with the new password.
      await supabase.auth.signOut();

      const store = useAuthStore.getState();
      store.setSession(null);
      store.setUser(null);
      store.setIsPasswordRecovery(false);
      store.setRecoverySession(null);

      toast.success("Password changed successfully. Please sign in.");
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Password update failed:", err);
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || checking || hasValidToken === null) {
    return <FullPageLoader />;
  }

  if (!hasValidToken) {
    return (
      <AuthLayout
        title="Invalid or Expired Link"
        subtitle="Password reset link is invalid or expired"
      >
        <div className="text-center space-y-4 py-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-rose-400" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This password reset link is invalid, already used, or expired.
            Request a new link and open it directly from the email.
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
            onClick={() => setShowPassword((v) => !v)}
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
            onClick={() => setShowConfirm((v) => !v)}
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
