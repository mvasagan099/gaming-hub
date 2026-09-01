import { useEffect, useMemo, useState } from "react";
import {
  Trophy,
  Lock,
  Zap,
  Flame,
  Swords,
  Gamepad2,
  Users,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { apiClient } from "../../services/api/client";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { cn } from "../../lib/utils";
import type { UserAchievementItem, AchievementCategory } from "@gaming-hub/shared";

const CATEGORY_TABS: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: "ALL", label: "All Achievements", icon: <Trophy className="w-3.5 h-3.5" /> },
  { id: "GAMES", label: "Matches", icon: <Gamepad2 className="w-3.5 h-3.5" /> },
  { id: "WINS", label: "Victories", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  { id: "STREAK", label: "Streaks", icon: <Flame className="w-3.5 h-3.5" /> },
  { id: "TOURNAMENT", label: "Tournaments", icon: <Swords className="w-3.5 h-3.5" /> },
  { id: "GAME_MASTERY", label: "Game Mastery", icon: <Zap className="w-3.5 h-3.5" /> },
];

export const AchievementsPage: React.FC = () => {
  const [achievements, setAchievements] = useState<UserAchievementItem[]>([]);
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<UserAchievementItem[]>("/achievements/me")
      .then((data) => {
        if (cancelled) return;
        setAchievements(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load achievements");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const total = achievements.length;
    const unlocked = achievements.filter((a) => a.unlocked).length;
    const totalXp = achievements.filter((a) => a.unlocked).reduce((sum, a) => sum + a.xpReward, 0);
    const pct = total === 0 ? 0 : Math.round((unlocked / total) * 100);
    return { total, unlocked, totalXp, pct };
  }, [achievements]);

  const filtered = useMemo(() => {
    if (activeTab === "ALL") return achievements;
    return achievements.filter((a) => a.category === activeTab);
  }, [achievements, activeTab]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          Achievements & Badges
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Complete competitive milestones, earn win streaks, and unlock prestigious trophies.
        </p>
      </div>

      {/* Progress Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600 p-6 md:p-8 text-white shadow-xl shadow-amber-500/10">
        <div className="flex items-center gap-2 text-amber-100 text-xs font-black uppercase tracking-widest">
          <Sparkles size={16} /> TROPHY CABINET
        </div>
        <div className="mt-3 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="text-4xl md:text-5xl font-black tracking-tight">
              {stats.unlocked}
              <span className="text-2xl md:text-3xl text-amber-200 font-bold"> / {stats.total}</span>
            </div>
            <p className="text-xs text-amber-100 font-semibold mt-1">
              Earned <span className="font-black text-white">+{stats.totalXp} XP</span> across all game disciplines
            </p>
          </div>
          <div className="text-left md:text-right">
            <div className="text-2xl font-black text-white">{stats.pct}% Complete</div>
            <p className="text-xs text-amber-100 font-medium">Keep competing to unlock remaining badges</p>
          </div>
        </div>

        {/* Bar */}
        <div className="mt-4 h-3 w-full rounded-full bg-white/20 p-0.5 backdrop-blur-sm">
          <div
            className="h-full rounded-full bg-white transition-all duration-500 shadow-sm"
            style={{ width: `${stats.pct}%` }}
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {CATEGORY_TABS.map((tab) => {
          const count =
            tab.id === "ALL"
              ? achievements.length
              : achievements.filter((a) => a.category === tab.id).length;
          if (count === 0 && tab.id !== "ALL") return null;

          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-extrabold transition-all whitespace-nowrap",
                isActive
                  ? "bg-accent-500 text-white shadow-lg shadow-accent-500/20 ring-2 ring-accent-500/30"
                  : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700",
              )}
            >
              {tab.icon}
              {tab.label}
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded-full text-[10px] font-black",
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Error state */}
      {error ? (
        <EmptyState
          icon={<Trophy size={28} className="text-rose-400" />}
          title="Could not load achievements"
          description={error}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Trophy size={28} className="text-slate-400" />}
          title="No achievements found"
          description="Check other categories to see available challenges."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((ach) => (
            <div
              key={ach.code}
              className={cn(
                "relative flex flex-col justify-between p-5 rounded-3xl border transition-all duration-200 overflow-hidden",
                ach.unlocked
                  ? "bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/40 shadow-sm"
                  : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700",
              )}
            >
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    "flex items-center justify-center w-14 h-14 rounded-2xl text-2xl shrink-0 shadow-md",
                    ach.unlocked
                      ? "bg-gradient-to-tr from-amber-500 to-orange-400 text-white ring-4 ring-amber-500/20"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700",
                  )}
                >
                  {ach.unlocked ? ach.icon || "🏆" : <Lock className="w-6 h-6 text-slate-500" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      className={cn(
                        "text-base font-black truncate",
                        ach.unlocked ? "text-amber-500 dark:text-amber-300" : "text-slate-900 dark:text-white",
                      )}
                    >
                      {ach.title}
                    </h3>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-500 dark:text-accent-400 text-[10px] font-black shrink-0">
                      <Zap className="w-3 h-3" /> +{ach.xpReward} XP
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {ach.description}
                  </p>
                </div>
              </div>

              {/* Progress or Unlocked Timestamp */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                {ach.unlocked ? (
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-black text-emerald-500 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" /> Unlocked
                    </span>
                    {ach.unlockedAt && (
                      <span className="text-[11px] text-slate-400 font-medium">
                        {new Date(ach.unlockedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-slate-400">Progress</span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {ach.progress.current} / {ach.progress.target} ({ach.progress.percentage}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent-500 transition-all duration-300"
                        style={{ width: `${ach.progress.percentage}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
