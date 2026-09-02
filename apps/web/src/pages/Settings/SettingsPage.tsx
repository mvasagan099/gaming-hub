import React, { useCallback, useEffect, useState } from 'react';
import { Check, Palette, Volume2, Shield, MonitorSmartphone, LogOut } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Switch } from '../../components/ui/Switch';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import type { LoginSession } from '@gaming-hub/shared';
import { sessionsApi } from '../../services/api/enterprise';
import { TwoFactorSetup } from '../../components/settings/TwoFactorSetup';
import {
  ACCENTS,
  ACCENT_SWATCHES,
  useTheme,
  type Accent,
  type Theme,
} from '../../contexts/ThemeProvider';
import { cn } from '../../lib/utils';

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System (follow device)' },
];

import { useAuthStore } from '../../store/authStore';
import { getAuthErrorMessage } from '../../lib/authErrors';

function useStoredPreference(key: string, defaultValue: boolean) {
  const [value, setValue] = useState<boolean>(
    () => (localStorage.getItem(key) === null ? defaultValue : localStorage.getItem(key) === '1')
  );

  useEffect(() => {
    localStorage.setItem(key, value ? '1' : '0');
  }, [key, value]);

  return [value, setValue] as const;
}

export const SettingsPage: React.FC = () => {
  const { theme, setTheme, accent, setAccent, contrast, setContrast } = useTheme();
  const [sound, setSound] = useStoredPreference('gaming-hub:sound', true);
  const [music, setMusic] = useStoredPreference('gaming-hub:music', true);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-accent-500" /> Appearance
          </CardTitle>
          <CardDescription>
            Personalize how Gaming Hub looks on this device. Accent color applies across the app.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">Theme</p>
            <Select
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
              aria-label="Theme"
            >
              {THEME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Accent color
            </p>
            <div role="radiogroup" aria-label="Accent color" className="flex items-center gap-3">
              {ACCENTS.map((value: Accent) => {
                const active = accent === value;
                return (
                  <button
                    key={value}
                    role="radio"
                    aria-checked={active}
                    aria-label={value}
                    onClick={() => setAccent(value)}
                    className={cn(
                      'relative h-8 w-8 rounded-full transition-transform',
                      ACCENT_SWATCHES[value],
                      active ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-offset-slate-900 dark:ring-white scale-110' : 'hover:scale-110'
                    )}
                  >
                    {active && (
                      <Check className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">High contrast</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Strengthen backgrounds and focus indicators for better readability.
              </p>
            </div>
            <Switch
              checked={contrast === 'high'}
              onCheckedChange={(checked) => setContrast(checked ? 'high' : 'normal')}
              aria-label="High contrast"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-accent-500" /> Audio & Preferences
          </CardTitle>
          <CardDescription>Control in-game audio on this device.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Sound effects</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Play in-game sounds and dice audio.
              </p>
            </div>
            <Switch
              checked={sound}
              onCheckedChange={setSound}
              aria-label="Sound effects"
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Background music</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ambient menu and match audio.
              </p>
            </div>
            <Switch
              checked={music}
              onCheckedChange={setMusic}
              aria-label="Background music"
            />
          </div>
        </CardContent>
      </Card>

      <TwoFactorSetup />

      <SessionsCard />
    </div>
  );
};

function SessionsCard() {
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const hasSession = Boolean(useAuthStore((s) => s.session));

  const load = useCallback(async () => {
    if (isAuthLoading) return;
    if (!hasSession) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSessions(await sessionsApi.list());
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [isAuthLoading, hasSession]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (id: string) => {
    setBusyId(id);
    try {
      await sessionsApi.revoke(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke session');
    } finally {
      setBusyId(null);
    }
  };

  const revokeAll = async () => {
    setBusyId('all');
    try {
      await sessionsApi.revokeAll();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke sessions');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent-500" /> Account & Security
        </CardTitle>
        <CardDescription>
          Devices currently signed into your account. Revoke any session you don't recognize.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {error && (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No active sessions found.
          </p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 p-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <MonitorSmartphone className="w-4 h-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {s.deviceName ?? 'Unknown device'}
                      {s.isCurrent && (
                        <span className="ml-2 rounded-full bg-accent-500/10 px-2 py-0.5 text-[10px] font-bold text-accent-600 dark:text-accent-400">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {s.ip ?? 'Unknown IP'} · {formatSessionDate(s.createdAt)}
                      {s.expiresAt ? ` · expires ${formatSessionDate(s.expiresAt)}` : ''}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revoke(s.id)}
                  disabled={busyId !== null || s.isCurrent}
                  title={s.isCurrent ? 'This is the session you are using' : 'Revoke session'}
                >
                  <LogOut className="w-3.5 h-3.5 mr-1" />
                  {busyId === s.id ? 'Revoking…' : 'Revoke'}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {sessions.length > 1 && (
          <Button variant="outline" size="sm" onClick={revokeAll} disabled={busyId !== null}>
            <Shield className="w-3.5 h-3.5 mr-1" />
            {busyId === "all" ? "Revoking…" : "Sign out all other devices"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function formatSessionDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString();
}
