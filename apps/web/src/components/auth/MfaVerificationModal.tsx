import React, { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { ShieldCheck, Loader2, AlertCircle, KeyRound } from "lucide-react";
import { Modal } from "../ui/Modal";
import { apiClient } from "../../services/api/client";

export function openMfaModal(reason?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("gaming-hub:mfa-required", {
        detail: { message: reason },
      })
    );
  }
}

export const MfaVerificationModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleMfaRequired = (e: Event) => {
      const customEvent = e as CustomEvent<{ message?: string; path?: string }>;
      setReason(customEvent.detail?.message || null);
      setErrorMessage(null);
      setToken("");
      setIsOpen(true);
    };

    window.addEventListener("gaming-hub:mfa-required", handleMfaRequired);
    return () => window.removeEventListener("gaming-hub:mfa-required", handleMfaRequired);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = token.trim().replace(/\D/g, "");
    if (cleanToken.length !== 6) {
      setErrorMessage("Please enter a valid 6-digit authentication code.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await apiClient.post<{ status: string; mfaVerified?: boolean }>("/auth/2fa/verify", {
        token: cleanToken,
      });

      toast.success("Security verification successful! 2FA session is now active.");
      setIsOpen(false);
      setToken("");

      // Notify listening components to retry or reload data
      window.dispatchEvent(new CustomEvent("gaming-hub:mfa-verified"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid or expired verification code.";
      setErrorMessage(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      size="md"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Security Verification</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">
              Two-Factor Authentication Required
            </p>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {reason && !reason.includes("/api/auth/2fa/verify")
            ? reason
            : "This administrative action requires 2FA authorization. Please enter the current 6-digit code from your authenticator app (e.g., Google Authenticator, Authy):"}
        </p>

        {errorMessage && (
          <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-3.5 text-xs text-rose-500 flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="relative">
          <KeyRound className="w-4 h-4 text-slate-400 absolute left-4 top-4" />
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="000000"
            value={token}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 6);
              setToken(val);
              if (errorMessage) setErrorMessage(null);
            }}
            className="w-full bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white rounded-2xl pl-11 pr-4 py-3.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-colors text-center tracking-[0.4em] font-mono text-xl font-bold"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || token.length !== 6}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-extrabold shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            {submitting ? "Verifying…" : "Authorize Action"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
