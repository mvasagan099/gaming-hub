import { AuthenticatorQr } from "./AuthenticatorQr";
import React, { useState } from "react";
import toast from "react-hot-toast";
import { Shield, Check, X, Loader2, ExternalLink, Key } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import { Button } from "../ui/Button";
import { twoFactorApi } from "../../services/api/twoFactor";
import { useMe } from "../../services/api/useMe";

export const TwoFactorSetup: React.FC = () => {
  const { me, reload } = useMe();
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [localEnabled, setLocalEnabled] = useState<boolean | null>(null);

  const enabled = localEnabled ?? Boolean(me?.profile?.twoFactorEnabled);

  const handleSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await twoFactorApi.setup();
      setSecret(result.secret);
      setAuthUrl(result.authUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to setup 2FA");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (token.length !== 6) {
      toast.error("Enter a 6-digit code");
      return;
    }

    setVerifying(true);
    setError(null);
    try {
      await twoFactorApi.verify(token);
      toast.success("2FA enabled successfully!");
      setLocalEnabled(true);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid verification code");
    } finally {
      setVerifying(false);
    }
  };

  if (enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-500" /> Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Your account is protected with 2FA
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 p-4 rounded-xl bg-green-500/10 border border-green-500/30">
            <Check className="w-5 h-5 text-green-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                Two-factor authentication is active
              </p>
              <p className="text-xs text-green-600/80 dark:text-green-400/80 mt-0.5">
                Sign-in, wallet transfers, and administrative actions require your 6-digit authenticator code.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (secret && authUrl) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-4 h-4 text-accent-500" /> Setup Authenticator
          </CardTitle>
          <CardDescription>
            Scan this QR code with Google Authenticator or similar app
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}

          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-white rounded-xl border-2 border-slate-200">
              <AuthenticatorQr
                authUrl={authUrl}
                className="w-48 h-48"
              />
            </div>

            <div className="w-full space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Or enter this code manually:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-xs text-slate-700 dark:text-slate-300 break-all">
                  {secret}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(secret)}
                  title="Copy secret"
                >
                  Copy
                </Button>
              </div>
            </div>

            <div className="w-full space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Enter the 6-digit code from your authenticator:
              </p>
              <div className="relative">
                <Shield className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={token}
                  onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white rounded-xl pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-colors text-center tracking-[0.3em] font-mono"
                />
              </div>
            </div>

            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setSecret(null);
                  setAuthUrl(null);
                  setToken("");
                }}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleVerify}
                disabled={verifying || token.length !== 6}
              >
                {verifying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                {verifying ? "Verifying..." : "Verify & Enable"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent-500" /> Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          Add an extra layer of security to your account
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50">
          <Shield className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              Protect your account with 2FA
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Use Google Authenticator or similar app to generate one-time codes. You'll need to enter a code each time you sign in.
            </p>
          </div>
        </div>

        <Button
          className="w-full"
          onClick={handleSetup}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
          {loading ? "Setting up..." : "Setup 2FA"}
        </Button>

        <a
          href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 text-xs font-medium text-indigo-500 hover:text-indigo-400 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Get Google Authenticator
        </a>
      </CardContent>
    </Card>
  );
};
