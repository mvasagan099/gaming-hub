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
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { PublicProfileModal } from "./PublicProfileModal";
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
    case "rating":
      return "skill rating";
    default:
      return metric;
  }
}

function RankBadge({ rank, size = "md" }: { rank: number; size?: "sm" | "md" }) {
  const box = size === "sm" ? "w-6 h-6 text-xs" : "w-9 h-9 text-sm";
  if (rank === 1) {
    return (
      <span className={cn(box, "flex items-center justify-center rounded-full bg-gradient-to-tr from-amber-500/20 to-yellow-400/30 border border-amber-400/60 shadow-[0_0_12px_rgba(245,158,11,0.3)]")}>
        <Crown className="w-4 h-4 text-amber-400 animate-pulse" />
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className={cn(box, "flex items-center justify-center rounded-full bg-gradient-to-tr from-slate-400/20 to-slate-200/30 border border-slate-300/50")}>
        <Medal className="w-4 h-4 text-slate-200" />
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className={cn(box, "flex items-center justify-center rounded-full bg-gradient-to-tr from-amber-700/20 to-amber-600/30 border border-amber-600/50")}>
        <Medal className="w-4 h-4 text-amber-500" />
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

function Row({
  entry,
  metric,
  viewerId,
  onSelectPlayer,
}: {
  entry: RankedLeaderboardEntry;
  metric: LeaderboardMetric;
  viewerId: string | undefined;
  onSelectPlayer?: (userId: string) => void;
}) {
  const isViewer = entry.userId === viewerId;
  return (
    <div
      onClick={() => onSelectPlayer?.(entry.userId)}
      className={cn(
        "flex items-center justify-between gap-3 p-3.5 rounded-2xl border transition-all duration-200 group cursor-pointer",
        isViewer
          ? "bg-accent-500/10 border-accent-500/40 ring-1 ring-accent-500/30"
          : entry.rank === 1
            ? "bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border-amber-500/30 hover:border-amber-500/50"
            : entry.rank === 2
              ? "bg-gradient-to-r from-slate-400/10 via-slate-400/5 to-transparent border-slate-400/30 hover:border-slate-400/50"
              : entry.rank === 3
                ? "bg-gradient-to-r from-amber-700/10 via-amber-700/5 to-transparent border-amber-700/30 hover:border-amber-700/50"
                : "bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <RankBadge rank={entry.rank} />
        <Avatar entry={entry} className="w-10 h-10 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-900 dark:text-white text-sm truncate group-hover:text-accent-400 transition-colors flex items-center gap-1">
              {entry.displayName || entry.username}
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
            </span>
            {isViewer && (
              <span className="rounded-full bg-accent-500/15 border border-accent-500/30 text-accent-400 text-[9px] font-black uppercase px-1.5 py-0.5 shrink-0">
                You
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {entry.country ? `${entry.country} • ` : ""}
            <span className="font-semibold text-slate-700 dark:text-slate-300">{entry.wins} wins</span>
            {` • ${entry.matches} matches`}
            {entry.winRate > 0 && ` • ${entry.winRate.toFixed(0)}% win rate`}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className={cn("text-base font-black tracking-tight", metric === "fastestWin" ? "text-emerald-500" : "text-accent-500")}>
          {formatMetricValue(metric, entry.metricValue)}
        </p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">{metricSuffix(metric)}</p>
      </div>
    </div>
  );
}

function PodiumCard({
  entry,
  place,
  onSelectPlayer,
}: {
  entry: RankedLeaderboardEntry;
  place: 1 | 2 | 3;
  onSelectPlayer?: (userId: string) => void;
}) {
  const podium = {
    1: {
      bar: "bg-gradient-to-t from-amber-600/90 via-amber-500/80 to-amber-400/90 h-40 border-amber-400/50 shadow-[0_4px_24px_rgba(245,158,11,0.25)]",
      text: "text-amber-300",
      label: "Champion",
      lift: "",
      ring: "ring-4 ring-amber-400/60 shadow-[0_0_16px_rgba(245,158,11,0.4)]",
    },
    2: {
      bar: "bg-gradient-to-t from-slate-600/80 via-slate-500/70 to-slate-400/80 h-32 border-slate-300/40",
      text: "text-slate-200",
      label: "Runner-up",
      lift: "mt-5",
      ring: "ring-4 ring-slate-300/50",
    },
    3: {
      bar: "bg-gradient-to-t from-amber-900/80 via-amber-800/70 to-amber-700/80 h-28 border-amber-600/40",
      text: "text-amber-400",
      label: "3rd Place",
      lift: "mt-8",
      ring: "ring-4 ring-amber-600/40",
    },
  }[place];

  return (
    <div
      onClick={() => onSelectPlayer?.(entry.userId)}
      className={cn("flex flex-col items-center gap-2 transition-transform duration-300 hover:-translate-y-1 cursor-pointer", podium.lift)}
    >
      <div className="relative">
        <Avatar entry={entry} className={cn("w-16 h-16", podium.ring)} />
        {place === 1 ? (
          <Crown className="absolute -top-5 left-1/2 -translate-x-1/2 w-6 h-6 text-amber-400 animate-bounce" />
        ) : (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-slate-900/80 border border-white/20 flex items-center justify-center text-[10px] font-black text-white">
            #{place}
          </div>
        )}
      </div>
      <div className="text-center max-w-[110px]">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{podium.label}</p>
        <p className="text-xs font-black text-slate-900 dark:text-white truncate">
          {entry.displayName || entry.username}
        </p>
      </div>
      <div className={cn("w-full max-w-[120px] rounded-t-2xl rounded-b-lg border flex flex-col items-center justify-center p-2 backdrop-blur-md", podium.bar)}>
        <p className={cn("text-2xl font-black drop-shadow-md", podium.text)}>
          {formatMetricValue(entry.metric, entry.metricValue)}
        </p>
        <p className="text-[9px] text-white/90 uppercase tracking-widest font-bold">{metricSuffix(entry.metric)}</p>
      </div>
    </div>
  );
}

export const LeaderboardView: React.FC = () => {
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const siteSettings = useSettingsStore((s) => s.settings);
  const lbSettings = siteSettings?.leaderboard;

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("global"); // 'global' | 'tournament' | 'friends' | gameId
  const [scope, setScope] = useState<LeaderboardScope>("global");
  const [period, setPeriod] = useState<LeaderboardPeriod>("all");
  const [metric, setMetric] = useState<LeaderboardMetric>("rating");
  const [gameId, setGameId] = useState<string>(GAME_DEFINITIONS[0]?.id || "chess");
  const [country, setCountry] = useState<string>("US");
  const [region, setRegion] = useState<string>(REGIONS[0] ?? "Asia");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<RankedLeaderboardPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const periodsEnabled = lbSettings?.periodsEnabled !== false;
  const effectivePeriod: LeaderboardPeriod = periodsEnabled ? period : "all";

  // Synchronize activeTab with scope/gameId
  const handleTabSelect = (tab: string) => {
    setActiveTab(tab);
    setPage(1);
    if (tab === "global") {
      setScope("global");
      setMetric("rating");
    } else if (tab === "tournament") {
      setScope("tournament");
      setMetric("wins");
    } else if (tab === "friends") {
      setScope("friends");
      setMetric("wins");
    } else {
      setScope("game");
      setGameId(tab);
      setMetric("rating");
    }
  };

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
    scope === "game"
      ? (GAME_DEFINITIONS.find((g) => g.id === gameId)?.name ?? "Game")
      : LEADERBOARD_SCOPE_LABELS[scope],
    periodsEnabled ? LEADERBOARD_PERIOD_LABELS[effectivePeriod] : null,
    `Ranked by ${LEADERBOARD_METRIC_LABELS[metric]}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-6">
      {/* Header Banner */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-500/15 via-yellow-500/20 to-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-black uppercase tracking-widest shadow-sm">
          <Trophy className="w-4 h-4 text-amber-400" /> GLOBAL CHAMPIONS HALL
        </div>
        <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
          Leaderboard
        </h1>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>

      {!session ? (
        <EmptyState
          icon={<LogIn className="w-6 h-6 text-accent-400" />}
          title="Sign in to view the leaderboard"
          description="Leaderboards are tied to your account. Sign in to view rankings and your position."
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
          {/* Main Category Tabs (Global + Games + Tournaments + Friends) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700/50">
            <button
              onClick={() => handleTabSelect("global")}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold whitespace-nowrap transition-all duration-200 shrink-0",
                activeTab === "global"
                  ? "bg-accent-500 text-white shadow-md shadow-accent-500/20 scale-[1.02]"
                  : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700",
              )}
            >
              <Globe className="w-3.5 h-3.5" />
              GLOBAL
            </button>

            {GAME_DEFINITIONS.map((game) => (
              <button
                key={game.id}
                onClick={() => handleTabSelect(game.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold whitespace-nowrap transition-all duration-200 shrink-0",
                  activeTab === game.id
                    ? "bg-accent-500 text-white shadow-md shadow-accent-500/20 scale-[1.02]"
                    : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700",
                )}
              >
                <span>{game.icon}</span>
                <span>{game.name.toUpperCase()}</span>
              </button>
            ))}

            <button
              onClick={() => handleTabSelect("tournament")}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold whitespace-nowrap transition-all duration-200 shrink-0",
                activeTab === "tournament"
                  ? "bg-accent-500 text-white shadow-md shadow-accent-500/20 scale-[1.02]"
                  : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700",
              )}
            >
              <Swords className="w-3.5 h-3.5" />
              TOURNAMENTS
            </button>

            <button
              onClick={() => handleTabSelect("friends")}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold whitespace-nowrap transition-all duration-200 shrink-0",
                activeTab === "friends"
                  ? "bg-accent-500 text-white shadow-md shadow-accent-500/20 scale-[1.02]"
                  : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700",
              )}
            >
              <Users className="w-3.5 h-3.5" />
              FRIENDS
            </button>
          </div>

          {/* Sub-Filters: Time Period and Metric Selection */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100 dark:bg-slate-900/40 p-3 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm dark:shadow-none backdrop-blur-md">
            {/* Periods */}
            {periodsEnabled && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 mr-1">Period:</span>
                {LEADERBOARD_PERIODS.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setPeriod(p);
                      setPage(1);
                    }}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-bold transition-all",
                      period === p
                        ? "bg-accent-500 text-white shadow-sm"
                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-transparent shadow-sm dark:shadow-none",
                    )}
                  >
                    {LEADERBOARD_PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>
            )}

            {/* Metrics */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 mr-1">Metric:</span>
              {LEADERBOARD_METRICS.filter((m) => m !== "coins").map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMetric(m);
                    setPage(1);
                  }}
                  className={cn(
                    "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all",
                    metric === m
                      ? "bg-accent-500 text-white shadow-sm"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-transparent shadow-sm dark:shadow-none",
                  )}
                >
                  {METRIC_ICONS[m]}
                  {LEADERBOARD_METRIC_LABELS[m]}
                </button>
              ))}
            </div>
          </div>


          {/* Content Body */}
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
              icon={<Trophy className="w-8 h-8 text-slate-400" />}
              title="No rankings found"
              description="Play games or enter tournaments to establish ranking on this leaderboard."
            />
          ) : data ? (
            <>
              {/* Top 3 Podium Cards */}
              {page === 1 && data.items.length >= 3 && (
                <div className="grid grid-cols-3 gap-3 items-end py-4">
                  <PodiumCard entry={data.items[1]} place={2} onSelectPlayer={setSelectedPlayerId} />
                  <PodiumCard entry={data.items[0]} place={1} onSelectPlayer={setSelectedPlayerId} />
                  <PodiumCard entry={data.items[2]} place={3} onSelectPlayer={setSelectedPlayerId} />
                </div>
              )}

              {/* Leaderboard Rows */}
              <div className={cn("space-y-2", loading && "opacity-60 transition-opacity")}>
                {data.items.map((entry) => (
                  <Row
                    key={entry.userId}
                    entry={entry}
                    metric={metric}
                    viewerId={viewerId}
                    onSelectPlayer={setSelectedPlayerId}
                  />
                ))}
              </div>

              {/* Viewer's standing when off-page */}
              {data.viewer && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <Sparkles className="w-3 h-3 text-accent-400" /> YOUR CURRENT RANKING
                  </div>
                  <Row
                    entry={data.viewer}
                    metric={metric}
                    viewerId={viewerId}
                    onSelectPlayer={setSelectedPlayerId}
                  />
                </div>
              )}

              {/* Pagination Controls */}
              <div className="flex items-center justify-between pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                </Button>
                <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400">
                  {data.total > 0
                    ? `Page ${page} of ${Math.max(1, Math.ceil(data.total / data.pageSize))} (${data.total} players)`
                    : "No results"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= Math.max(1, Math.ceil(data.total / data.pageSize)) || loading}
                >
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </>
          ) : null}
        </>
      )}

      {selectedPlayerId && (
        <PublicProfileModal
          userId={selectedPlayerId}
          onClose={() => setSelectedPlayerId(null)}
        />
      )}
    </div>
  );
};
