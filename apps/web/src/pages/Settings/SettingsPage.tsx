import React, { useEffect, useState } from 'react';
import { Check, Palette, Volume2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Switch } from '../../components/ui/Switch';
import { Select } from '../../components/ui/Select';
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
    </div>
  );
};
