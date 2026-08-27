import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy,
  Users,
  Swords,
  CalendarClock,
  Clock,
  Search,
  Filter,
  Loader2,
  Sparkles,
  Zap,
  Flame,
  Shield,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  GAME_DEFINITIONS,
  TOURNAMENT_TIER_VISUALS,
  DEFAULT_TOURNAMENT_TIERS,
  type TournamentTierConfig,
  type TournamentSummary,
} from '@gaming-hub/shared';
import { tournamentsApi } from '../../services/api/enterprise';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/EmptyState';
import { MyTournamentsView } from '../../components/tournaments/MyTournamentsView';

const gameById = new Map(GAME_DEFINITIONS.map((g) => [g.id, g]));

const STATUS_BADGE: Record<
  string,
  { variant: 'success' | 'warning' | 'danger' | 'accent' | 'default' | 'outline'; label: string }
> = {
  DRAFT: { variant: 'outline', label: 'Draft' },
  REGISTRATION_OPEN: { variant: 'accent', label: 'Registration Open' },
  REGISTRATION_CLOSED: { variant: 'default', label: 'Registration Closed' },
  UPCOMING: { variant: 'default', label: 'Upcoming' },
  STARTING: { variant: 'warning', label: 'Starting Soon' },
  IN_PROGRESS: { variant: 'success', label: 'Live Now' },
  PAUSED: { variant: 'warning', label: 'Paused' },
  COMPLETED: { variant: 'accent', label: 'Completed' },
  SETTLING: { variant: 'warning', label: 'Settling' },
  SETTLED: { variant: 'success', label: 'Settled' },
  LIVE: { variant: 'success', label: 'Live Now' },
  CANCELLED: { variant: 'danger', label: 'Cancelled' },
};

const STATUS_FILTER_TABS = [
  { value: '', label: 'ALL TOURNAMENTS' },
  { value: 'REGISTRATION_OPEN', label: 'OPEN FOR JOIN' },
  { value: 'IN_PROGRESS', label: 'LIVE NOW 🔴' },
  { value: 'UPCOMING', label: 'UPCOMING' },
  { value: 'COMPLETED', label: 'COMPLETED' },
] as const;

const FORMAT_LABELS: Record<string, string> = {
  SINGLE_ELIMINATION: 'Single Elimination',
  BRACKET: 'Single Elimination',
  KNOCKOUT: 'Knockout',
  ROUND_ROBIN: 'Round Robin',
  SWISS: 'Swiss',
  DOUBLE_ELIMINATION: 'Double Elim',
};

function formatCountdown(targetDate: string | null | undefined): string {
  if (!targetDate) return '';
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return '00:00:00';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function detectTier(title: string, entryFee: number): string {
  const t = title.toLowerCase();
  if (t.includes('pro') || entryFee >= 100) return 'pro';
  if (t.includes('premium') || entryFee >= 50) return 'premium';
  if (t.includes('standard') || entryFee >= 25) return 'standard';
  if (t.includes('basic') || entryFee >= 10) return 'basic';
  return 'mini';
}

function LiveTimerBadge({ target, label }: { target: string; label: string }) {
  const [cd, setCd] = useState(() => formatCountdown(target));
  useEffect(() => {
    const update = () => setCd(formatCountdown(target));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [target]);

  const isExpired = cd === '00:00:00';

  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-amber-300">
      <Clock className="size-3 text-amber-400 shrink-0" />
      <span>{label}</span>
      <span className={isExpired ? 'text-slate-500' : 'text-amber-300 font-bold'}>{cd}</span>
    </span>
  );
}

export function TournamentsPage() {
  const navigate = useNavigate();
  const [mainTab, setMainTab] = useState<'explore' | 'my-tournaments'>('explore');
  const [items, setItems] = useState<TournamentSummary[]>([]);
  const [backendTiers, setBackendTiers] = useState<TournamentTierConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [gameFilter, setGameFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 30;

  // Fetch Tiers & Tournaments
  const load = async (p = page) => {
    setLoading(true);
    setError(null);
    try {
      const [tournamentsRes, tiersRes] = await Promise.allSettled([
        tournamentsApi.list({
          page: p,
          pageSize,
          status: statusFilter || undefined,
          gameId: gameFilter || undefined,
        }),
        tournamentsApi.tiers().catch(() => ({ items: [] as TournamentTierConfig[] })),
      ]);

      if (tournamentsRes.status === 'fulfilled') {
        setItems(tournamentsRes.value.items);
        setTotal(tournamentsRes.value.total);
      }
      if (tiersRes.status === 'fulfilled' && tiersRes.value?.items?.length) {
        setBackendTiers(tiersRes.value.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    load(1);
  }, [statusFilter, gameFilter]);

  // Client filtering on search and tier
  const filtered = useMemo(() => {
    return items.filter((t) => {
      if (tierFilter) {
        const tier = detectTier(t.title, t.entryFee);
        if (tier !== tierFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const game = gameById.get(t.gameId);
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchGame = game?.name?.toLowerCase().includes(q) || t.gameId.toLowerCase().includes(q);
        if (!matchTitle && !matchGame) return false;
      }
      return true;
    });
  }, [items, search, tierFilter]);

  const totalPages = Math.ceil(total / pageSize);

  const displayTiers = backendTiers.length > 0 ? backendTiers : DEFAULT_TOURNAMENT_TIERS;

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-6 lg:px-8 space-y-8">
      {/* ------------------------------------------------------------- */}
      {/* 1. HERO HEADER                                                */}
      {/* ------------------------------------------------------------- */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/40 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 size-80 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 size-60 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-400">
              <Trophy className="size-3.5" /> HOURLY COMPETITIVE SYSTEM
            </div>
            <h1 className="text-2xl font-black text-white sm:text-4xl tracking-tight">
              Tournaments Arena
            </h1>
            <p className="max-w-xl text-xs sm:text-sm text-slate-400">
              Compete in hourly bracket tournaments across 10 games. Guaranteed prize pools distributed to top 4 positions (50% / 25% / 15% / 10%).
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-1.5 self-start sm:self-center rounded-2xl border border-slate-800 bg-slate-950/80 p-1.5 backdrop-blur-md shrink-0">
            <button
              onClick={() => setMainTab('explore')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                mainTab === 'explore'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Swords className="size-3.5" /> Explore Tournaments
            </button>
            <button
              onClick={() => setMainTab('my-tournaments')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                mainTab === 'my-tournaments'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Trophy className="size-3.5" /> My Tournaments
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 2. FIVE-TIER COMPARISON SHOWCASE (Prompt #2)                  */}
        {/* ------------------------------------------------------------- */}
        {mainTab === 'explore' && (
          <div className="mt-8 pt-6 border-t border-slate-800/80">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-amber-400" /> 5 Tournament Tiers
              </span>
              {tierFilter && (
                <button
                  onClick={() => setTierFilter('')}
                  className="text-xs text-amber-400 hover:underline font-semibold"
                >
                  Clear Tier Filter
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              {displayTiers.map((tier) => {
                const vis = TOURNAMENT_TIER_VISUALS[tier.code] ?? TOURNAMENT_TIER_VISUALS.mini!;
                const isSelected = tierFilter === tier.code;

                return (
                  <button
                    key={tier.code}
                    onClick={() => setTierFilter(isSelected ? '' : tier.code)}
                    className={`group relative overflow-hidden rounded-2xl border p-3.5 text-left transition-all backdrop-blur-md ${
                      isSelected
                        ? `${vis.borderClass} bg-slate-900/90 shadow-lg shadow-indigo-500/10 ring-2 ring-indigo-500/40`
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{vis.badgeEmoji}</span>
                        <span className="font-black text-xs text-white uppercase tracking-wider">
                          {tier.name}
                        </span>
                      </div>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${vis.badgeBgClass}`}>
                        🪙 {tier.entryFee}
                      </span>
                    </div>

                    <div className="mt-2.5 space-y-1">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-[10px] text-slate-400">Prize Pool</span>
                        <span className="font-extrabold text-amber-400">
                          🪙 {tier.prizePool.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-[10px] text-slate-400">Max Players</span>
                        <span className="font-semibold text-slate-200">
                          {tier.maxPlayers.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-2 text-[10px] font-bold text-amber-400 text-center">
                        ✓ FILTERED
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. MAIN CONTENT: EXPLORE OR MY TOURNAMENTS                    */}
      {/* ------------------------------------------------------------- */}
      {mainTab === 'my-tournaments' ? (
        <MyTournamentsView />
      ) : (
        <div className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              <AlertCircle className="size-4 shrink-0" /> {error}
            </div>
          )}

          {/* Search, Status Tabs & Filters Bar */}
          <div className="space-y-4">
            {/* Status Filter Tabs (ALL / OPEN / LIVE NOW / UPCOMING / COMPLETED) */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {STATUS_FILTER_TABS.map((f) => (
                  <button
                    key={f.value || 'ALL'}
                    onClick={() => setStatusFilter(f.value)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-black transition-all ${
                      statusFilter === f.value
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Tier Quick Filter Buttons */}
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-slate-500 font-bold uppercase mr-1">Tier:</span>
                <button
                  onClick={() => setTierFilter('')}
                  className={`rounded-xl px-2.5 py-1 text-[11px] font-bold border transition-all ${
                    !tierFilter
                      ? 'bg-slate-800 text-white border-slate-700'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  All
                </button>
                {['mini', 'basic', 'standard', 'premium', 'pro'].map((code) => {
                  const vis = TOURNAMENT_TIER_VISUALS[code]!;
                  const active = tierFilter === code;
                  return (
                    <button
                      key={code}
                      onClick={() => setTierFilter(active ? '' : code)}
                      className={`rounded-xl px-2.5 py-1 text-[11px] font-black border flex items-center gap-1 transition-all ${
                        active
                          ? `${vis.badgeBgClass} ${vis.borderClass}`
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <span>{vis.badgeEmoji}</span>
                      <span className="capitalize">{code}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search and Game dropdown */}
            <div className="flex flex-wrap gap-2.5">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by tournament name or game..."
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 py-2.5 pl-10 pr-4 text-xs sm:text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400 transition-colors"
                />
              </div>

              <select
                value={gameFilter}
                onChange={(e) => setGameFilter(e.target.value)}
                aria-label="Filter by game"
                className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs sm:text-sm text-slate-200 outline-none focus:border-amber-400 transition-colors"
              >
                <option value="">All 10 Games</option>
                {GAME_DEFINITIONS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.icon} {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ----------------------------------------------------------- */}
          {/* TOURNAMENT CARDS GRID                                       */}
          {/* ----------------------------------------------------------- */}
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full rounded-3xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Trophy className="size-8 text-amber-400" />}
              title="No tournaments match your filter"
              description={search || tierFilter || gameFilter ? 'Try clearing your filters or search terms.' : 'Check back shortly for newly scheduled hourly tournaments.'}
            />
          ) : (
            <>
              <div className="grid gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((t) => (
                  <TournamentLobbyCard
                    key={t.id}
                    tournament={t}
                    onClick={() => navigate(`/tournaments/${t.id}`)}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => {
                      setPage(page - 1);
                      load(page - 1);
                    }}
                    className="border-slate-800 text-slate-300 hover:text-white"
                  >
                    Previous
                  </Button>
                  <span className="text-xs font-mono text-slate-400">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => {
                      setPage(page + 1);
                      load(page + 1);
                    }}
                    className="border-slate-800 text-slate-300 hover:text-white"
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. TOURNAMENT LOBBY CARD (Prompt #1, #5, #6, #29, #30)
// ---------------------------------------------------------------------------

function TournamentLobbyCard({
  tournament: t,
  onClick,
}: {
  tournament: TournamentSummary;
  onClick: () => void;
}) {
  const game = gameById.get(t.gameId);
  const tierCode = detectTier(t.title, t.entryFee);
  const vis = TOURNAMENT_TIER_VISUALS[tierCode] ?? TOURNAMENT_TIER_VISUALS.mini!;

  const statusInfo = STATUS_BADGE[t.status] ?? { variant: 'outline' as const, label: t.status };
  const isRegOpen = t.status === 'REGISTRATION_OPEN';
  const isLive = t.status === 'IN_PROGRESS' || t.status === 'LIVE';
  const isStarting = t.status === 'STARTING';
  const isCompleted = t.status === 'COMPLETED' || t.status === 'SETTLED';

  const fillPercentage = Math.min(100, Math.round((t.registeredCount / t.maxPlayers) * 100));
  const isFull = t.registeredCount >= t.maxPlayers;
  const isAlmostFull = isRegOpen && !isFull && fillPercentage >= 80;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-800/90 bg-gradient-to-b from-slate-900/90 via-slate-900/60 to-slate-950 p-5 text-left transition-all hover:border-slate-700 hover:shadow-xl hover:shadow-black/50 backdrop-blur-xl ${
        isLive ? 'ring-1 ring-emerald-500/40' : ''
      }`}
    >
      {/* Top Background Glow */}
      <div className={`absolute top-0 right-0 h-32 w-32 bg-gradient-to-bl ${vis.gradientClass} blur-2xl pointer-events-none opacity-40 group-hover:opacity-70 transition-opacity`} />

      <div>
        {/* Header Badges */}
        <div className="flex items-center justify-between gap-2">
          {/* Tier Badge */}
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-black border ${vis.badgeBgClass}`}>
            <span>{vis.badgeEmoji}</span>
            <span className="uppercase tracking-wider">{vis.name}</span>
          </span>

          {/* Status Badge */}
          <Badge variant={statusInfo.variant} className="text-[10px] font-black uppercase tracking-wider">
            {isLive ? (
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" />
                LIVE NOW
              </span>
            ) : isAlmostFull ? (
              'ALMOST FULL'
            ) : (
              statusInfo.label
            )}
          </Badge>
        </div>

        {/* Game and Title */}
        <div className="mt-3.5 flex items-start gap-3">
          <span className="text-3xl shrink-0 drop-shadow-md">{game?.icon ?? '🏆'}</span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-black text-white group-hover:text-amber-400 transition-colors">
              {t.title}
            </h3>
            <p className="text-xs text-slate-400 font-medium truncate">
              {game?.name ?? t.gameId} · {FORMAT_LABELS[t.format] ?? t.format}
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {/* Prize Pool */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-2.5">
            <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Prize Pool</p>
            <p className="text-lg font-black text-amber-400 tracking-tight">
              🪙 {t.prizePool.toLocaleString()}
            </p>
          </div>

          {/* Entry Fee */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-2.5">
            <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Entry Fee</p>
            <p className="text-lg font-black text-slate-200">
              🪙 {t.entryFee.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Capacity Progress Bar (Prompt #6) */}
        <div className="mt-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <Users className="size-3 text-slate-500" /> Players
            </span>
            <span className="font-mono font-bold text-slate-200">
              {t.registeredCount} <span className="text-slate-500">/ {t.maxPlayers}</span>
              {isFull && <span className="ml-1 text-rose-400 font-black">(FULL)</span>}
              {isAlmostFull && <span className="ml-1 text-amber-400 font-black">(ALMOST FULL)</span>}
            </span>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full transition-all ${
                isFull
                  ? 'bg-rose-500'
                  : isAlmostFull
                  ? 'bg-amber-500'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-400'
              }`}
              style={{ width: `${fillPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Footer / CTA (Prompt #1, #7, #29) */}
      <div className="mt-4 pt-3.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
        {/* Countdown Info */}
        <div className="min-w-0 text-xs">
          {isRegOpen ? (
            <LiveTimerBadge
              target={t.registrationEndsAt ?? t.startTime}
              label="Closes: "
            />
          ) : isStarting ? (
            <span className="text-[11px] font-bold text-amber-400 animate-pulse">
              Starting Bracket...
            </span>
          ) : isLive ? (
            <span className="text-[11px] font-bold text-emerald-400">
              Matches In Progress
            </span>
          ) : isCompleted ? (
            <span className="text-[11px] text-slate-500 font-medium">
              Tournament Finished
            </span>
          ) : (
            <span className="text-[11px] text-slate-400 font-medium">
              Starts: {new Date(t.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Action Button */}
        <div>
          {isRegOpen && !isFull ? (
            <span className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1.5 text-xs font-black text-slate-950 shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
              JOIN <ArrowRight className="size-3" />
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-bold text-slate-300 group-hover:border-slate-600 transition-colors">
              VIEW <ArrowRight className="size-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
