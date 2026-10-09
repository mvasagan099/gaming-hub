import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "../../services/supabase";
import { apiClient } from "../../services/api/client";
import { useAuthStore } from "../../store/authStore";
import { getAuthErrorMessage, logAuthError } from "../../lib/authErrors";
import { AuthLayout } from "./AuthLayout";
import { getAuthLinkSession } from "../../lib/authLinkSession";
import type { Session } from "@supabase/supabase-js";

/**
 * Dedicated Authentication Callback Handler (/auth/callback).
 *
 * Processes Supabase auth redirects for:
 * 1. Email confirmations (signup)
 * 2. Password recovery links (forgot password)
 * 3. OAuth redirects
 *
 * Supports both PKCE Code Exchange (`?code=...`) and Implicit Token Hash (`#access_token=...`).
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>("Authenticating and verifying your session…");

  useEffect(() => {
    let mounted = true;
    let authSubscription: { unsubscribe: () => void } | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function handleAuthCallback() {
      try {
        const searchParams = new URLSearchParams(location.search);
        const hashParams = new URLSearchParams(
          location.hash.startsWith("#") ? location.hash.substring(1) : location.hash
        );

        // 1. Check for errors returned by Supabase
        const error = searchParams.get("error") || hashParams.get("error");
        const errorDescription =
          searchParams.get("error_description") || hashParams.get("error_description");

        if (error || errorDescription) {
          throw new Error(errorDescription || error || "Authentication failed");
        }

        const nextParam = searchParams.get("next");
        const type = searchParams.get("type") || hashParams.get("type");
        const isRecovery =
          type === "recovery" ||
          location.hash.includes("type=recovery") ||
          location.search.includes("type=recovery") ||
          nextParam === "/reset-password";

        const completeAuth = async (session: Session) => {
          if (!mounted) return;
          useAuthStore.getState().setIsPasswordRecovery(false);
          useAuthStore.getState().setRecoverySession(null);

          const result = await useAuthStore.getState().verifySession(session);
          if (!mounted || result === 'superseded') return;
          if (result === 'mfa_pending') {
            navigate('/2fa', { replace: true });
            return;
          }

          // If Admin, redirect to /admin by default if nextParam was not explicitly set
          try {
            const meData = await apiClient.get<{ user: { role: string } }>("/auth/me");
            if (meData?.user?.role === "ADMIN" && !nextParam) {
              navigate("/admin", { replace: true });
              return;
            }
          } catch {
            // Ignore fallback
          }

          navigate(nextParam || "/", { replace: true });
        };

        // Supabase initialization may already have consumed the one-time code.
        const code = searchParams.get("code");
        const session = await getAuthLinkSession(code);

        if (session && mounted) {
          if (isRecovery) {
            useAuthStore.getState().clearAuth();
              useAuthStore.getState().setIsPasswordRecovery(true);
            useAuthStore.getState().setRecoverySession(session);
            useAuthStore.getState().setSession(null);
            useAuthStore.getState().setUser(null);
            navigate("/reset-password", { replace: true });
            return;
          }

          await completeAuth(session);
          return;
        }

        // 4. If no session is found after check, wait for onAuthStateChange
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, newSession) => {
          if (!mounted) return;
          if (event === "PASSWORD_RECOVERY") {
            useAuthStore.getState().clearAuth();
              useAuthStore.getState().setIsPasswordRecovery(true);
            useAuthStore.getState().setRecoverySession(newSession);
            useAuthStore.getState().setSession(null);
            useAuthStore.getState().setUser(null);
            navigate("/reset-password", { replace: true });
          } else if (event === "SIGNED_IN" && newSession) {
            if (isRecovery) {
              useAuthStore.getState().clearAuth();
              useAuthStore.getState().setIsPasswordRecovery(true);
              useAuthStore.getState().setRecoverySession(newSession);
              useAuthStore.getState().setSession(null);
              useAuthStore.getState().setUser(null);
              navigate("/reset-password", { replace: true });
            } else {
              void completeAuth(newSession).catch((error) => {
                if (mounted) setErrorMsg(getAuthErrorMessage(error));
              });
            }
          }
        });

        authSubscription = subscription;
        // Timeout fallback after 4 seconds
        timeout = setTimeout(() => {
          if (mounted && !useAuthStore.getState().session && !useAuthStore.getState().isPasswordRecovery) {
            subscription.unsubscribe();
            setErrorMsg("Authentication session could not be established. Please try logging in again.");
          }
        }, 4000);
      } catch (err) {
        if (mounted) {
          logAuthError("AuthCallback", err);
          setErrorMsg(getAuthErrorMessage(err));
        }
      }
    }

    void handleAuthCallback();

    return () => {
      mounted = false;
      authSubscription?.unsubscribe();
      if (timeout) clearTimeout(timeout);
    };
  }, [location, navigate]);

  if (errorMsg) {
    return (
      <AuthLayout title="Authentication Error" subtitle="There was a problem verifying your link">
        <div className="text-center space-y-4 py-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-rose-400" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{errorMsg}</p>
          <button
            onClick={() => navigate("/login", { replace: true })}
            className="inline-block px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors"
          >
            Back to Sign In
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Verifying…" subtitle={statusMsg}>
      <div className="text-center space-y-4 py-6 flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className="text-xs text-slate-500 dark:text-slate-400">Please wait while we redirect you…</p>
      </div>
    </AuthLayout>
  );
}
