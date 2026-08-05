import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { LogIn, Mail, Lock, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "../../services/supabase";
import { AuthLayout } from "./AuthLayout";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string; state?: unknown } } | null)?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [useMagicLink, setUseMagicLink] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
          email,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Magic link sent — check your inbox");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Welcome back!");
      navigate(from?.pathname ?? "/", { replace: true, state: from?.state });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not sign in";
      toast.error(message);
      if (/invalid login credentials/i.test(message)) {
        setUseMagicLink(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to access your profile, wallet and matches"
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
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
          {submitting ? "Signing in…" : useMagicLink ? "Send magic link" : "LOG IN"}
        </button>

        <button
          type="button"
          onClick={() => setUseMagicLink((v) => !v)}
          className="w-full flex items-center justify-center gap-2 text-xs font-bold text-indigo-500 hover:text-indigo-400 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {useMagicLink ? "Use email & password instead" : "Send me a magic link instead"}
        </button>
      </form>

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
    </AuthLayout>
  );
}
