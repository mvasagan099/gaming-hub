import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { ShieldCheck, Loader2 } from "lucide-react";
import { twoFactorApi } from "../../services/api/twoFactor";
import { apiClient } from "../../services/api/client";
import { useAuthStore } from "../../store/authStore";
import { getAuthErrorMessage, logAuthError } from "../../lib/authErrors";
import { AuthLayout } from "./AuthLayout";

export function TwoFactorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const stateObj = location.state as {
    userId?: string;
    from?: { pathname?: string; state?: unknown };
    next?: string;
  } | null;

  const session = useAuthStore((s) => s.session);
  const userId = stateObj?.userId || session?.user?.id;

  useEffect(() => {
    if (!userId && !session) {
      navigate("/login", { replace: true });
    }
  }, [userId, session, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (token.length !== 6) {
      toast.error("Enter a 6-digit code");
      return;
    }

    setSubmitting(true);
    try {
      if (session?.access_token) {
        await twoFactorApi.verifySession(token);
      } else if (userId) {
        await twoFactorApi.verifyLogin(userId, token);
      } else {
        await twoFactorApi.verifySession(token);
      }

      toast.success("2FA verified! Welcome back.");

      const target = stateObj?.next || stateObj?.from?.pathname;
      if (target) {
        navigate(target, { replace: true, state: stateObj?.from?.state });
        return;
      }

      try {
        const meData = await apiClient.get<{ user: { role: string } }>("/auth/me");
        if (meData?.user?.role === "ADMIN") {
          navigate("/admin", { replace: true });
          return;
        }
      } catch {
        // Fallback to default
      }

      navigate("/", { replace: true });
    } catch (err) {
      logAuthError("TwoFactorVerify", err);
      toast.error(getAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Two-factor authentication" subtitle="Enter the code from your authenticator app">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <ShieldCheck className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoFocus
            placeholder="000000"
            value={token}
            onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white rounded-xl pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-colors text-center tracking-[0.5em] font-mono text-lg"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || token.length !== 6}
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {submitting ? "Verifying…" : "Verify"}
        </button>
      </form>

      <div className="pt-5 mt-5 border-t border-slate-200 dark:border-slate-800 text-center">
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          Enter the 6-digit code from Google Authenticator or similar app
        </p>
      </div>
    </AuthLayout>
  );
}
