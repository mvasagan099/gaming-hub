import { useEffect, useMemo, useState } from 'react';
import { Trophy, Lock, Coins } from 'lucide-react';
import type { Achievement } from '@gaming-hub/shared';
import { achievementsApi } from '../../services/api/enterprise';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';

interface UnlockedInfo {
  unlockedAt: string;
}

export const AchievementsPage: React.FC = () => {
  const [definitions, setDefinitions] = useState<Achievement[]>([]);
  const [unlocked, setUnlocked] = useState<Map<string, UnlockedInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([achievementsApi.list(), achievementsApi.mine()])
      .then(([defs, mine]) => {
        if (cancelled) return;
        setDefinitions(defs);
        setUnlocked(new Map(mine.map((m) => [m.code, { unlockedAt: m.unlockedAt }])));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load achievements');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const total = definitions.length;
    const done = definitions.filter((d) => unlocked.has(d.code)).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pct };
  }, [definitions, unlocked]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Achievements</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Complete challenges to earn XP and coin rewards.
        </p>
      </div>

      <div className="rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-6 text-white shadow-lg">
        <div className="flex items-center gap-2 text-amber-100 text-xs font-bold uppercase tracking-widest">
          <Trophy size={16} /> Progress
        </div>
        <div className="mt-2 flex items-end justify-between">
          <div className="text-4xl font-black">
            {grouped.done}<span className="text-2xl text-amber-100">/{grouped.total}</span>
          </div>
          <div className="text-right text-sm text-amber-100">{grouped.pct}% complete</div>
        </div>
        <div className="mt-3 h-2.5 w-full rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white transition-all" style={{ width: `${grouped.pct}%` }} />
        </div>
      </div>

      {error ? (
        <EmptyState icon={<Trophy size={24} />} title="Could not load achievements" description={error} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {definitions.map((def) => {
            const mine = unlocked.get(def.code);
            const isUnlocked = Boolean(mine);
            return (
              <div
                key={def.code}
                className={`rounded-2xl border p-4 transition-colors ${
                  isUnlocked
                    ? 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${
                      isUnlocked
                        ? 'bg-amber-500/15'
                        : 'bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    {isUnlocked ? def.icon : <Lock size={18} className="text-slate-400" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-black ${isUnlocked ? 'text-amber-900 dark:text-amber-200' : 'text-slate-900 dark:text-white'}`}>
                      {def.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{def.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
                      <span className="rounded-full bg-accent-500/10 px-2 py-0.5 text-accent-600 dark:text-accent-400">
                        ⚡ {def.xpReward} XP
                      </span>
                      {mine && (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">
                          <Coins size={10} className="mr-0.5 inline" />
                          Unlocked {new Date(mine.unlockedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
