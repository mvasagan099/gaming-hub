import { useEffect, useState } from 'react';
import { Flag, Search, Sliders, CheckCircle2, XCircle, Loader2, Sparkles } from 'lucide-react';
import { adminApi } from '../../services/api/enterprise';
import { useFeatureFlagsStore } from '../../store/featureFlagsStore';
import type { FeatureFlagGroup, FeatureFlagEntry } from '@gaming-hub/shared';

export function AdminFeaturesPage() {
  const [groups, setGroups] = useState<FeatureFlagGroup[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadFlags = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.featureFlags();
      setGroups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feature flags');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadFlags();
  }, []);

  const handleToggle = async (flag: FeatureFlagEntry) => {
    setPending(flag.key);
    setError(null);
    try {
      await adminApi.toggleFeatureFlag(flag.key, !flag.enabled);
      setGroups((prev) =>
        prev
          ? prev.map((group) => ({
              ...group,
              flags: group.flags.map((f) =>
                f.key === flag.key ? { ...f, enabled: !flag.enabled } : f,
              ),
            }))
          : prev,
      );
      void useFeatureFlagsStore.getState().loadFlags(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update flag');
    } finally {
      setPending(null);
    }
  };

  const totalFlags = groups?.reduce((acc, g) => acc + g.flags.length, 0) ?? 0;
  const enabledFlags = groups?.reduce((acc, g) => acc + g.flags.filter((f) => f.enabled).length, 0) ?? 0;

  const filteredGroups = groups
    ?.map((group) => ({
      ...group,
      flags: group.flags.filter(
        (f) =>
          f.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.description.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    }))
    .filter((g) => g.flags.length > 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-xs font-bold text-slate-400">Loading Feature Flags...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 md:p-8 rounded-[2rem] bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white shadow-xl shadow-indigo-950/20 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold mb-3">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Real-time Toggles
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Feature Flags</h1>
            <p className="text-sm font-normal text-indigo-200 mt-1 max-w-xl">
              Enable or disable platform capabilities in real time. Changes take effect instantly without restarting servers.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-center">
              <div className="text-lg font-black">{enabledFlags}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">Active</div>
            </div>
            <div className="px-4 py-2 rounded-2xl bg-white/10 border border-white/20 text-white text-center">
              <div className="text-lg font-black">{totalFlags}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">Total</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center w-full md:w-80 rounded-2xl bg-white dark:bg-slate-900 px-4 py-2.5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter feature flags..."
            className="ml-3 w-full bg-transparent outline-none text-xs text-slate-900 dark:text-white placeholder-slate-400"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs font-bold flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Groups List */}
      <div className="space-y-6">
        {filteredGroups?.map((group) => (
          <div
            key={group.key}
            className="rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden shadow-sm"
          >
            {/* Group Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">{group.label}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{group.description}</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] font-black text-slate-600 dark:text-slate-400">
                {group.flags.length} Flags
              </span>
            </div>

            {/* Group Flags List */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {group.flags.map((flag) => (
                <div
                  key={flag.key}
                  className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors"
                >
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{flag.label}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide uppercase ${
                          flag.enabled
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                        }`}
                      >
                        {flag.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{flag.description}</p>
                    <code className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                      {flag.key}
                    </code>
                  </div>

                  {/* Toggle Button */}
                  <button
                    onClick={() => void handleToggle(flag)}
                    disabled={pending === flag.key}
                    aria-pressed={flag.enabled}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-all duration-300 disabled:opacity-50 ${
                      flag.enabled
                        ? 'bg-emerald-500 shadow-md shadow-emerald-500/30'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-1 size-5 rounded-full bg-white transition-all duration-300 shadow-sm flex items-center justify-center ${
                        flag.enabled ? 'translate-x-[22px]' : 'translate-x-1'
                      }`}
                    >
                      {pending === flag.key ? (
                        <Loader2 className="w-3 h-3 animate-spin text-slate-600" />
                      ) : null}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
