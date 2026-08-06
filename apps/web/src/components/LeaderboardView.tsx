import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Trophy,
  Crown,
  Medal,
  LogIn,
  Globe,
  MapPin,
  Users,
  Gamepad2,
  Swords,
  Target,
  Clock,
  Flame,
  Coins,
  Zap,
  Gauge,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  COUNTRIES,
  GAME_DEFINITIONS,
  LEADERBOARD_METRIC_LABELS,
  LEADERBOARD_METRICS,
  LEADERBOARD_PERIOD_LABELS,
  LEADERBOARD_PERIODS,
  LEADERBOARD_SCOPE_LABELS,
  LEADERBOARD_SCOPES,
  REGIONS,
  type LeaderboardMetric,
  type LeaderboardPeriod,
  type LeaderboardScope,
  type RankedLeaderboardEntry,
  type RankedLeaderboardPage,
} from "@gaming-hub/shared";
import { useAuthStore } from "../store/authStore";
import { useSettingsStore } from "../store/settingsStore";
import { leaderboardApi } from "../services/api/enterprise";
import { ApiError } from "../services/api/client";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { Button } from "./ui/Button";
import { cn } from "../lib/utils";

const SCOPE_ICONS: Record<LeaderboardScope, React.ReactNode> = {
  global: <Globe className="w-3.5 h-3.5" />,
  game: <Gamepad2 className="w-3.5 h-3.5" />,
  country: <MapPin className="w-3.5 h-3.5" />,
  region: <MapPin className="w-3.5 h-3.5" />,
  friends: <Users className="w-3.5 h-3.5" />,
  tournament: <Swords className="w-3.5 h-3.5" />,
};

const METRIC_ICONS: Record<LeaderboardMetric, React.ReactNode> = {
  rating: <Gauge className="w-3.5 h-3.5" />,
  wins: <Trophy className="w-3.5 h-3.5" />,
  xp: <Zap className="w-3.5 h-3.5" />,
  coins: <Coins className="w-3.5 h-3.5" />,
  matches: <Target className="w-3.5 h-3.5" />,
  winRate: <Target className="w-3.5 h-3.5" />,
  fastestWin: <Clock className="w-3.5 h-3.5" />,
  streak: <Flame className="w-3.5 h-3.5" />,
};

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatMetricValue(metric: LeaderboardMetric, value: number): string {
  switch (metric) {
    case "winRate":
      return `${value.toFixed(1)}%`;
    case "fastestWin":
      return formatDuration(value);
    default:
      return value.toLocaleString();
  }
}

function metricSuffix(metric: LeaderboardMetric): string {
  switch (metric) {
    case "winRate":
      return "win rate";
    case "fastestWin":
      return "fastest win";
    case "streak":
      return "best streak";
    default:
      return metric;
  }
}

function RankBadge({ rank, size = "md" }: { rank: number; size?: "sm" | "md" }) {
  const box = size === "sm" ? "w-6 h-6 text-xs" : "w-9 h-9 text-sm";
  if (rank === 1) {
    return (
      <span className={cn(box, "flex items-center justify-center rounded-full bg-amber-500/15 border border-amber-500/40")}>
        <Crown className="w-4 h-4 text-amber-400" />
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className={cn(box, "flex items-center justify-center rounded-full bg-slate-400/10 border border-slate-400/40")}>
        <Medal className="w-4 h-4 text-slate-300" />
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className={cn(box, "flex items-center justify-center rounded-full bg-amber-600/10 border border-amber-600/40")}>
        <Medal className="w-4 h-4 text-amber-600" />
      </span>
    );
  }
  return (
    <span className={cn(box, "flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-black")}>
      #{rank}
    </span>
  );
}

function Avatar({ entry, className }: { entry: RankedLeaderboardEntry; className?: string }) {
  if (entry.avatarUrl) {
    return <img src={entry.avatarUrl} alt="" className={cn("rounded-full object-cover", className)} />;
  }
  return (
    <div className={cn("rounded-full bg-accent-500/20 border border-accent-500/30 flex items-center justify-center font-black text-accent-400", className)}>
      {(entry.displayName || entry.username || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

function Row({ entry, metric, viewerId }: { entry: RankedLeaderboardEntry; metric: LeaderboardMetric; viewerId: string | undefined }) {
  const isViewer = entry.userId === viewerId;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 p-3.5 rounded-2xl border transition-colors",
        isViewer
          ? "bg-accent-500/10 border-accent-500/40 ring-1 ring-accent-500/30"
          : entry.rank === 1
            ? "bg-gradient-to-r from-amber-500/10 to-transparent border-amber-500/20"
            : "bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <RankBadge rank={entry.rank} />
        <Avatar entry={entry} className="w-10 h-10 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-extrabold text-slate-900 dark:text-white text-sm truncate">
              {entry.displayName || entry.username}
            </p>
            {isViewer && (
              <span className="rounded-full bg-accent-500/15 border border-accent-500/30 text-accent-400 text-[9px] font-black uppercase px-1.5 py-0.5 shrink-0">
                You
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
            {entry.country ? `${entry.country} • ` : ""}
            {entry.wins} wins • {entry.matches} games
            {entry.winRate > 0 && ` • ${entry.winRate.toFixed(0)}%`}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className={cn("text-sm font-black", metric === "fastestWin" ? "text-emerald-500" : "text-accent-500")}>
          {formatMetricValue(metric, entry.metricValue)}
        </p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">{metricSuffix(metric)}</p>
      </div>
    </div>
  );
}

function PodiumCard({ entry, place }: { entry: RankedLeaderboardEntry; place: 1 | 2 | 3 }) {
  const podium = {
    1: { bar: "bg-gradient-to-t from-amber-600 to-amber-400 h-36", text: "text-amber-400", label: "Champion", lift: "" },
    2: { bar: "bg-gradient-to-t from-slate-500 to-slate-300 h-28", text: "text-slate-300", label: "Runner-up", lift: "lg:mt-5 mt-4" },
    3: { bar: "bg-gradient-to-t from-amber-800 to-amber-600 h-24", text: "text-amber-600", label: "Third", lift: "lg:mt-8 mt-6" },
  }[place];
  return (
    <div className={cn("flex flex-col items-center gap-2", podium.lift)}>
      <div className="relative">
        <Avatar entry={entry} className="w-14 h-14 ring-4 ring-white dark:ring-slate-900" />
        {place === 1 && <Crown className="absolute -top-4 left-1/2 -translate-x-1/2 w-5 h-5 text-amber-400" />}
      </div>
      <div className="text-center">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{podium.label}</p>
        <p className="text-xs font-extrabold text-slate-900 dark:text-white max-w-24 truncate">
          {entry.displayName || entry.username}
        </p>
      </div>
      <div className={cn("w-full max-w-28 rounded-t-2xl rounded-b-lg border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center", podium.bar)}>
        <p className={cn("text-2xl font-black", podium.text)}>{formatMetricValue(entry.metric, entry.metricValue)}</p>
        <p className="text-[9px] text-white/80 uppercase tracking-widest">{metricSuffix(entry.metric)}</p>
      </div>
    </div>
  );
}

export const LeaderboardView: React.FC = () => {
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const siteSettings = useSettingsStore((s) => s.settings);
  const lbSettings = siteSettings?.leaderboard;

  const [scope, setScope] = useState<LeaderboardScope>("global");
  const [period, setPeriod] = useState<LeaderboardPeriod>("all");
  const [metric, setMetric] = useState<LeaderboardMetric>("wins");
  const [gameId, setGameId] = useState<string>(GAME_DEFINITIONS[0].id);
  const [country, setCountry] = useState<string>("US");
  const [region, setRegion] = useState<string>(REGIONS[0] ?? "Asia");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<RankedLeaderboardPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const periodsEnabled = lbSettings?.periodsEnabled !== false;
  const effectivePeriod: LeaderboardPeriod = periodsEnabled ? period : "all";

  const scopeEntries = useMemo(
    () =>
      LEADERBOARD_SCOPES.filter((s) => {
        if (s === "game") return lbSettings?.gameEnabled !== false;
        if (s === "country") return lbSettings?.countryEnabled !== false;
        if (s === "region") return lbSettings?.regionEnabled !== false;
        if (s === "friends") return lbSettings?.friendsEnabled !== false;
        if (s === "tournament") return lbSettings?.tournamentEnabled !== false;
        return true;
      }),
    [lbSettings],
  );

  useEffect(() => {
    if (!scopeEntries.includes(scope)) setScope("global");
  }, [scopeEntries, scope]);

  useEffect(() => {
    if (!session) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    leaderboardApi
      .get({
        scope,
        period: effectivePeriod,
        metric,
        gameId: scope === "game" ? gameId : undefined,
        country: scope === "country" ? country : undefined,
        region: scope === "region" ? region : undefined,
        page,
        pageSize: 20,
      })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load the leaderboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, scope, period, effectivePeriod, metric, gameId, country, region, page]);

  const viewerId = user?.id;
  const subtitle = [
    LEADERBOARD_SCOPE_LABELS[scope],
    periodsEnabled ? LEADERBOARD_PERIOD_LABELS[effectivePeriod] : null,
    `ranked by ${LEADERBOARD_METRIC_LABELS[metric]}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-wider">
          <Trophy className="w-3.5 h-3.5" /> HALL OF CHAMPIONS
        </div>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white transition-colors duration-300">
          Leaderboards
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-300">{subtitle}</p>
      </div>

      {!session ? (
        <EmptyState
          icon={<LogIn className="w-6 h-6 text-accent-400" />}
          title="Sign in to view the leaderboard"
          description="Leaderboards are tied to your account. Sign in to see the top players."
          action={
            <Link to="/login">
              <Button variant="primary" size="sm">Sign in</Button>
            </Link>
          }
        />
      ) : lbSettings?.enabled === false ? (
        <EmptyState
          icon={<Trophy className="w-6 h-6 text-slate-400" />}
          title="Leaderboards are disabled"
          description="The admin has turned off leaderboards for now. Check back later."
        />
      ) : (
        <>
          <div className="flex flex-wrap justify-center gap-1 rounded-2xl bg-slate-100 dark:bg-slate-800/70 p-1">
            {scopeEntries.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setScope(s);
                  setPage(1);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors",
                  scope === s
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200",
                )}
              >
                {SCOPE_ICONS[s]}
                {LEADERBOARD_SCOPE_LABELS[s]}
              </button>
            ))}
          </div>

          {periodsEnabled && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {LEADERBOARD_PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPeriod(p);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-bold transition-colors",
                    period === p
                      ? "bg-accent-500 text-white"
                      : "bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700",
                  )}
                >
                  {LEADERBOARD_PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-1.5">
            {LEADERBOARD_METRICS.map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMetric(m);
                  setPage(1);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition-colors",
                  metric === m
                    ? "bg-accent-500 text-white"
                    : "bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700",
                )}
              >
                {METRIC_ICONS[m]}
                {LEADERBOARD_METRIC_LABELS[m]}
              </button>
            ))}
          </div>

          {scope === "game" && (
            <div className="flex justify-center">
              <select
                value={gameId}
                onChange={(e) => {
                  setGameId(e.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                {GAME_DEFINITIONS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.icon} {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === "country" && (
            <div className="flex justify-center">
              <select
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === "region" && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {REGIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setRegion(r);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-bold transition-colors",
                    region === r
                      ? "bg-accent-500 text-white"
                      : "bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          {error ? (
            <EmptyState
              icon={<Trophy className="w-6 h-6 text-rose-400" />}
              title="Could not load the leaderboard"
              description={error}
              action={
                <Button variant="primary" size="sm" onClick={() => setPage((p) => p)}>
                  Retry
                </Button>
              }
            />
          ) : loading && !data ? (
            <div className="glass-panel rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 flex-1">
                    <Skeleton className="w-9 h-9 rounded-full" />
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <Skeleton className="w-32 h-4" />
                  </div>
                  <Skeleton className="w-20 h-4" />
                </div>
              ))}
            </div>
          ) : data && data.items.length === 0 ? (
            <EmptyState
              icon={<Trophy className="w-6 h-6 text-slate-400" />}
              title="No rankings yet"
              description="Play a few matches to appear on this leaderboard."
            />
          ) : data ? (
            <>
              {page === 1 && data.items.length >= 3 && (
                <div className="grid grid-cols-3 gap-3 items-start">
                  <PodiumCard entry={data.items[1]} place={2} />
                  <PodiumCard entry={data.items[0]} place={1} />
                  <PodiumCard entry={data.items[2]} place={3} />
                </div>
              )}

              <div className={cn("space-y-2", loading && "opacity-60 transition-opacity")}>
                {data.items.map((entry) => (
                  <Row key={entry.userId} entry={entry} metric={metric} viewerId={viewerId} />
                ))}
              </div>

              {data.viewer && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 pt-2">
                    <Users className="w-3 h-3" /> Your rank
                  </div>
                  <Row entry={data.viewer} metric={metric} viewerId={viewerId} />
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
                  <ChevronLeft className="w-4 h-4" /> Previous
                </Button>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {data.total > 0 ? `Page ${page} of ${Math.max(1, Math.ceil(data.total / data.pageSize))}` : "No results"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= Math.max(1, Math.ceil(data.total / data.pageSize)) || loading}
                >
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
};
