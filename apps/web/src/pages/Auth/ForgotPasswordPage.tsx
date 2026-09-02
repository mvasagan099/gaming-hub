import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Mail, Loader2, MailCheck } from "lucide-react";
import { supabase } from "../../services/supabase";
import { getAuthRedirectUrl } from "../../lib/authUtils";
import { getAuthErrorMessage, logAuthError } from "../../lib/authErrors";
import { AuthLayout } from "./AuthLayout";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: getAuthRedirectUrl("/auth/callback?next=/reset-password"),
      });
      if (error) {
        logAuthError("ForgotPassword", error);
        toast.error(getAuthErrorMessage(error));
        return;
      }
      setSent(true);
      toast.success("If an account exists for this email, a password reset link has been sent.");
    } catch (err) {
      logAuthError("ForgotPassword", err);
      toast.error(getAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        title="Check your inbox"
        subtitle="Password reset link sent"
      >
        <div className="text-center space-y-4 py-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <MailCheck className="w-7 h-7 text-emerald-400" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            If an account exists for <span className="font-bold">{email}</span>, a password reset link has been sent. It expires shortly.
          </p>
          <Link
            to="/login"
            className="inline-block px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a secure link to set a new password"
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

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          {submitting ? "Sending…" : "SEND RESET LINK"}
        </button>
      </form>

      <p className="pt-5 mt-5 border-t border-slate-200 dark:border-slate-800 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
        Remembered it?{" "}
        <Link to="/login" className="text-indigo-500 hover:text-indigo-400 transition-colors">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
