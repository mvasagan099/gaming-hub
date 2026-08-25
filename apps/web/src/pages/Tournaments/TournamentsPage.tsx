import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Users, Swords, CalendarClock, Search, Filter, Loader2 } from 'lucide-react';
import { GAME_DEFINITIONS } from '@gaming-hub/shared';
import type { TournamentFormat, TournamentStatus, GameId } from '@gaming-hub/shared';
import { tournamentsApi } from '../../services/api/enterprise';
import type { TournamentSummary } from '@gaming-hub/shared';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/EmptyState';
import { MyTournamentsView } from '../../components/tournaments/MyTournamentsView';

const gameById = new Map(GAME_DEFINITIONS.map((g) => [g.id, g]));

const STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'danger' | 'accent' | 'default' | 'outline'; label: string }> = {
  UPCOMING: { variant: 'default', label: 'Upcoming' },
  LIVE: { variant: 'success', label: 'Live' },
  ENDED: { variant: 'outline', label: 'Ended' },
  CANCELLED: { variant: 'danger', label: 'Cancelled' },
  DRAFT: { variant: 'outline', label: 'Draft' },
  REGISTRATION_OPEN: { variant: 'accent', label: 'Registration Open' },
  REGISTRATION_CLOSED: { variant: 'default', label: 'Registration Closed' },
  STARTING: { variant: 'warning', label: 'Starting Soon' },
  IN_PROGRESS: { variant: 'success', label: 'In Progress' },
  COMPLETED: { variant: 'accent', label: 'Completed' },
  SETTLING: { variant: 'warning', label: 'Settling' },
  SETTLED: { variant: 'success', label: 'Settled' },
  PAUSED: { variant: 'warning', label: 'Paused' },
};

const STATUS_FILTERS = [
  { value: '', label: 'ALL' },
  { value: 'REGISTRATION_OPEN', label: 'OPEN' },
  { value: 'UPCOMING', label: 'UPCOMING' },
  { value: 'IN_PROGRESS', label: 'LIVE' },
  { value: 'COMPLETED', label: 'COMPLETED' },
  { value: 'SETTLED', label: 'SETTLED' },
] as const;

const FORMAT_LABELS: Record<string, string> = {
  SINGLE_ELIMINATION: 'Single Elim',
  BRACKET: 'Bracket',
  KNOCKOUT: 'Knockout',
  ROUND_ROBIN: 'Round Robin',
  SWISS: 'Swiss',
  DOUBLE_ELIMINATION: 'Double Elim',
};

function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return 'Started';
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}d`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function TournamentsPage() {
  const navigate = useNavigate();
  const [mainTab, setMainTab] = useState<'explore' | 'my-tournaments'>('explore');
  const [items, setItems] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [gameFilter, setGameFilter] = useState('');
  const [formatFilter, setFormatFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 24;

  const load = async (p = page) => {
    setLoading(true);
    setError(null);
    try {
      const data = await tournamentsApi.list({
        page: p,
        pageSize,
        status: statusFilter || undefined,
        gameId: gameFilter || undefined,
      });
      setItems(data.items);
      setTotal(data.total);
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

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((t) => t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
  }, [items, search]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Tournaments Hub</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Compete for prize pools across all 10 multiplayer games.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900/80">
          <button
            onClick={() => setMainTab('explore')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              mainTab === 'explore'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Explore Tournaments
          </button>
          <button
            onClick={() => setMainTab('my-tournaments')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              mainTab === 'my-tournaments'
                ? 'bg-amber-500 text-slate-950 shadow-sm font-black'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            🏆 My Tournaments
          </button>
        </div>
      </div>

      {mainTab === 'my-tournaments' ? (
        <MyTournamentsView />
      ) : (
        <>

      {error && (
        <div className="mb-4 rounded-2xl border border-rose-500/50 bg-rose-500/10 p-4 text-sm text-rose-600">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tournaments..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <select
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">All Games</option>
            {GAME_DEFINITIONS.map((g) => (
              <option key={g.id} value={g.id}>{g.icon} {g.name}</option>
            ))}
          </select>
          <select
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">All Formats</option>
            {Object.entries(FORMAT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value || 'ALL'}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                statusFilter === f.value
                  ? 'bg-indigo-500 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Trophy className="size-7" />}
          title="No tournaments found"
          description={search ? 'Try adjusting your search or filters.' : 'Check back later for new tournaments.'}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => (
              <TournamentCard key={t.id} tournament={t} onClick={() => navigate(`/tournaments/${t.id}`)} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => { setPage(page - 1); load(page - 1); }}
              >
                Previous
              </Button>
              <span className="text-sm text-slate-500">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => { setPage(page + 1); load(page + 1); }}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
      </>
    )}
  </div>
);
}

function TournamentCard({
  tournament: t,
  onClick,
}: {
  tournament: TournamentSummary;
  onClick: () => void;
}) {
  const game = gameById.get(t.gameId);
  const statusInfo = STATUS_BADGE[t.status] ?? { variant: 'outline' as const, label: t.status };
  const isRegOpen = t.status === 'REGISTRATION_OPEN';
  const isFull = t.registeredCount >= t.maxPlayers;

  return (
    <button
      onClick={onClick}
      className="group rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all hover:border-indigo-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-indigo-500"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{game?.icon ?? '🏆'}</span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black text-slate-900 dark:text-white">{t.title}</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {game?.name ?? t.gameId} · {FORMAT_LABELS[t.format] ?? t.format}
            </p>
          </div>
        </div>
        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/80">
          <p className="text-base font-black text-amber-500">🪙 {t.prizePool.toLocaleString()}</p>
          <p className="text-[9px] font-semibold uppercase text-slate-500 dark:text-slate-400">Prize Pool</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/80">
          <p className="text-base font-black text-slate-900 dark:text-white">{t.entryFee.toLocaleString()}</p>
          <p className="text-[9px] font-semibold uppercase text-slate-500 dark:text-slate-400">Entry</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/80">
          <p className="text-base font-black text-slate-900 dark:text-white">
            {t.registeredCount}<span className="text-sm text-slate-400">/{t.maxPlayers}</span>
          </p>
          <p className="text-[9px] font-semibold uppercase text-slate-500 dark:text-slate-400">Players</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
          <CalendarClock className="size-3.5" />
          {isRegOpen ? (
            <span>Closes in {formatRelativeTime(t.registrationEndsAt ?? t.startTime)}</span>
          ) : t.status === 'IN_PROGRESS' || t.status === 'LIVE' ? (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">In Progress</span>
          ) : (
            <span>{new Date(t.startTime).toLocaleDateString()}</span>
          )}
        </div>
        {isRegOpen && !isFull && (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
            JOIN NOW
          </span>
        )}
        {isRegOpen && isFull && (
          <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
            FULL
          </span>
        )}
      </div>
    </button>
  );
}
