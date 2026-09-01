import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { supabase } from "../../services/supabase";
import { useAuthStore } from "../../store/authStore";
import { AuthLayout } from "./AuthLayout";

export function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const finish = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error") || new URLSearchParams(url.hash.replace(/^#/, "")).get("error");
        const errorDescription =
          url.searchParams.get("error_description") ||
          new URLSearchParams(url.hash.replace(/^#/, "")).get("error_description");

        if (error) {
          throw new Error(errorDescription || error);
        }

        // PKCE confirmation/recovery links can arrive with ?code=...
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        // For implicit-flow links Supabase processes the URL automatically.
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (!data.session) {
          throw new Error("Authentication link is invalid or has expired.");
        }

        if (!active) return;

        useAuthStore.getState().setSession(data.session);
        useAuthStore.getState().setUser(data.session.user);
        useAuthStore.getState().setIsPasswordRecovery(false);
        useAuthStore.getState().setRecoverySession(null);
        useAuthStore.getState().setLoading(false);

        // A recovery callback should continue to the password form.
        const hash = window.location.hash || "";
        const search = window.location.search || "";
        const recovery =
          hash.includes("type=recovery") ||
          search.includes("type=recovery");

        if (recovery) {
          useAuthStore.getState().setIsPasswordRecovery(true);
          useAuthStore.getState().setRecoverySession(data.session);
          useAuthStore.getState().setSession(null);
          useAuthStore.getState().setUser(null);
          navigate("/reset-password", { replace: true });
          return;
        }

        toast.success("Email confirmed successfully. Welcome to Gaming Hub!");
        navigate("/", { replace: true });
      } catch (err) {
        if (!active) return;
        useAuthStore.getState().setLoading(false);
        toast.error(err instanceof Error ? err.message : "Authentication link is invalid or expired.");
        navigate("/login", { replace: true });
      }
    };

    void finish();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <AuthLayout
      title="Verifying your account"
      subtitle="Please wait while we securely complete authentication"
    >
      <div className="flex flex-col items-center justify-center py-8 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-sm text-slate-500">Verifying your email…</p>
      </div>
    </AuthLayout>
  );
}
