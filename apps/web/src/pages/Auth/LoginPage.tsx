import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { LogIn, Mail, Lock, Sparkles, Loader2, Wrench, AlertTriangle, ShieldCheck, ArrowLeft, Key } from "lucide-react";
import { supabase } from "../../services/supabase";
import { getAuthRedirectUrl } from "../../lib/authUtils";
import { getAuthErrorMessage, logAuthError } from "../../lib/authErrors";
import { apiClient } from "../../services/api/client";
import { twoFactorApi } from "../../services/api/twoFactor";
import { AuthLayout } from "./AuthLayout";
import { useSettingsStore } from "../../store/settingsStore";
import { useAuthStore } from "../../store/authStore";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as {
    from?: { pathname?: string; state?: unknown };
    require2FA?: boolean;
    next?: string;
  } | null;
  const from = locationState?.from;
  const settings = useSettingsStore((s) => s.settings);

  const isSessionRevoked = new URLSearchParams(location.search).get("reason") === "session_revoked";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [step, setStep] = useState<"credentials" | "2fa">(locationState?.require2FA ? "2fa" : "credentials");
  const [useMagicLink, setUseMagicLink] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const maintenanceEnabled = settings?.general?.maintenanceEnabled ?? false;
  const maintenanceMessage = settings?.general?.maintenanceMessage ?? "";

  // If redirected with require2FA, switch to 2FA step
  useEffect(() => {
    if (locationState?.require2FA) {
      setStep("2fa");
      useAuthStore.getState().setIsMfaRequired(true);
    }
  }, [locationState]);

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

  const handleVerify2FA = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = twoFactorCode.trim();
    if (cleanCode.length !== 6) {
      toast.error("Please enter your 6-digit authentication code");
      return;
    }

    setSubmitting(true);
    try {
      await twoFactorApi.verifySession(cleanCode);
      toast.success("2FA verified!");
      await finishLoginNavigation();
    } catch (err) {
      logAuthError("Login2FAVerify", err);
      toast.error(getAuthErrorMessage(err) || "Invalid 2FA verification code");
    } finally {
      setSubmitting(false);
    }
  };

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
        if (/invalid login credentials/i.test(error.message) || error.message.toLowerCase().includes("invalid_credentials")) {
          setUseMagicLink(true);
        }
        return;
      }
      
      const session = signInData?.session ?? (await supabase.auth.getSession()).data.session;
      if (!session) {
        await finishLoginNavigation();
        return;
      }
      
      let is2FARequired = false;

      try {
        const result = await apiClient.post<{ status: string; userId?: string }>(
          "/auth/session",
          { token: session.access_token },
          session.access_token
        );
        
        if (result.status === "2fa_required") {
          is2FARequired = true;
        }
      } catch (sessionErr) {
        console.error("Backend auth session check failed", sessionErr);
      }

      if (is2FARequired) {
        useAuthStore.getState().setIsMfaRequired(true);

        // If the user already typed their 6-digit code upfront, verify immediately in 1 shot!
        if (twoFactorCode.trim().length === 6) {
          try {
            await twoFactorApi.verifySession(twoFactorCode.trim());
            toast.success("2FA verified!");
            await finishLoginNavigation();
            return;
          } catch {
            toast.error("Invalid 2FA code. Please enter the latest code from your authenticator app.");
            setStep("2fa");
            setTwoFactorCode("");
            return;
          }
        }

        // Otherwise prompt for the 2FA code right here on the same page
        setStep("2fa");
        toast.success("Enter your 2FA authenticator code");
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

  const handleBackToCredentials = async () => {
    setSubmitting(true);
    try {
      await useAuthStore.getState().signOut();
    } catch {
      // Ignore
    } finally {
      useAuthStore.getState().setIsMfaRequired(false);
      setStep("credentials");
      setTwoFactorCode("");
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
      title={step === "2fa" ? "Two-Factor Verification" : "Welcome back"}
      subtitle={
        step === "2fa"
          ? "Enter the 6-digit code from Google Authenticator or your 2FA app"
          : "Log in to access your profile, wallet and matches"
      }
    >
      <div className="space-y-4">
        {isSessionRevoked && step !== "2fa" && (
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
            <div>
              <p className="font-bold text-sm text-slate-900 dark:text-white">Your account was signed in on another device.</p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">Please sign in again to continue on this device.</p>
            </div>
          </div>
        )}

        {step === "2fa" ? (
          /* Step 2: 2FA Authentication Challenge on the exact same page */
          <form onSubmit={handleVerify2FA} className="space-y-4">
            <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-center space-y-2">
              <div className="w-10 h-10 mx-auto rounded-xl bg-indigo-500/20 text-indigo-500 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
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

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                6-Digit Authenticator Code
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoFocus
                  placeholder="000000"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full bg-white dark:bg-slate-950 text-base text-slate-900 dark:text-white rounded-xl pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-colors text-center tracking-[0.4em] font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || twoFactorCode.length !== 6}
              className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {submitting ? "Verifying…" : "VERIFY & LOG IN"}
            </button>

            <button
              type="button"
              onClick={handleBackToCredentials}
              className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 text-xs font-bold text-slate-600 dark:text-slate-400 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to email & password
            </button>
          </form>
        ) : (
          /* Step 1: Standard Credentials Form */
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

            {!useMagicLink && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                    2FA Code
                  </span>
                  <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500">
                    If 2FA is enabled
                  </span>
                </div>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit authenticator code (optional)"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white rounded-xl pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-colors tracking-[0.2em] font-mono placeholder:font-sans placeholder:tracking-normal"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
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
        )}

        {step !== "2fa" && (
          <div className="pt-5 mt-5 border-t border-slate-200 dark:border-slate-800 space-y-2 text-center">
            <div className="flex items-center justify-center gap-4 text-xs font-bold">
              <Link to="/forgot-password" className="text-slate-500 dark:text-slate-400 hover:text-indigo-400 transition-colors">
                Forgot password?
              </Link>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <Link to="/signup" className="text-indigo-500 hover:text-indigo-400 transition-colors">
                Create an account
              </Link>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Multiplayer matches are tied to your account — sign in to play online.
            </p>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
