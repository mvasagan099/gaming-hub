import { useEffect, useState } from 'react';
import { Trophy, Users, Swords, CalendarClock } from 'lucide-react';
import { tournamentsApi } from '../../services/api/enterprise';
import { GAME_DEFINITIONS } from '@gaming-hub/shared';
import type { TournamentDetail, TournamentFormat, TournamentStatus, TournamentSummary } from '@gaming-hub/shared';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/ui/Button';

const STATUS_STYLES: Record<TournamentStatus, string> = {
  UPCOMING: 'bg-blue-500/10 text-blue-600',
  LIVE: 'bg-green-500/10 text-green-600',
  ENDED: 'bg-gray-500/10 text-gray-600',
  CANCELLED: 'bg-red-500/10 text-red-600',
};

const FORMAT_LABELS: Record<TournamentFormat, string> = {
  BRACKET: 'Bracket',
  KNOCKOUT: 'Knockout',
  ROUND_ROBIN: 'Round Robin',
  SWISS: 'Swiss',
};

const gameById = new Map(GAME_DEFINITIONS.map((g) => [g.id, g]));

export const TournamentsPage: React.FC = () => {
  const [items, setItems] = useState<TournamentSummary[]>([]);
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [filter, setFilter] = useState<'UPCOMING' | 'LIVE' | 'ENDED' | ''>('UPCOMING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await tournamentsApi.list({ pageSize: 100, status: filter || undefined });
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  const openDetail = async (id: string) => {
    setActionError(null);
    try {
      const d = await tournamentsApi.detail(id);
      setDetail(d);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load tournament');
    }
  };

  const handleRegister = async () => {
    if (!detail) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await tournamentsApi.register(detail.id);
      const d = await tournamentsApi.detail(detail.id);
      setDetail(d);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to register');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!detail) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await tournamentsApi.cancel(detail.id);
      const d = await tournamentsApi.detail(detail.id);
      setDetail(d);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to cancel registration');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Tournaments</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Compete for prize pools across your favorite games.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
          {(['UPCOMING', 'LIVE', 'ENDED', ''] as const).map((f) => (
            <button
              key={f || 'ALL'}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                filter === f ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {f || 'ALL'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-10 text-center">
          <Trophy className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No tournaments found.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((t) => (
            <button
              key={t.id}
              onClick={() => void openDetail(t.id)}
              className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 text-left hover:border-indigo-500/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{gameById.get(t.gameId)?.icon ?? '🏆'}</span>
                  <div>
                    <h2 className="text-sm font-black text-slate-900 dark:text-white">{t.title}</h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {gameById.get(t.gameId)?.name ?? t.gameId} · {FORMAT_LABELS[t.format]}
                    </p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${STATUS_STYLES[t.status]}`}>
                  {t.status}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 p-2">
                  <p className="text-base font-black text-amber-500">🪙 {t.prizePool.toLocaleString()}</p>
                  <p className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold uppercase">Prize pool</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 p-2">
                  <p className="text-base font-black text-slate-900 dark:text-white">{t.entryFee}</p>
                  <p className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold uppercase">Entry</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 p-2">
                  <p className="text-base font-black text-slate-900 dark:text-white">
                    {t.registeredCount}/{t.maxPlayers}
                  </p>
                  <p className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold uppercase">Players</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                <CalendarClock className="h-3.5 w-3.5" />
                {new Date(t.startTime).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">{detail.title}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {gameById.get(detail.gameId)?.name ?? detail.gameId} · {FORMAT_LABELS[detail.format]} ·{' '}
                  {new Date(detail.startTime).toLocaleString()}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${STATUS_STYLES[detail.status]}`}>
                {detail.status}
              </span>
            </div>

            {detail.description && (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{detail.description}</p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 p-3 text-center">
                <p className="text-xl font-black text-amber-500">🪙 {detail.prizePool.toLocaleString()}</p>
                <p className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold uppercase">Prize pool</p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 p-3 text-center">
                <p className="text-xl font-black text-slate-900 dark:text-white">{detail.entryFee}</p>
                <p className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold uppercase">Entry fee</p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 p-3 text-center">
                <p className="text-xl font-black text-slate-900 dark:text-white">
                  {detail.registeredCount}/{detail.maxPlayers}
                </p>
                <p className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold uppercase">Players</p>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                <Users size={14} /> Registered players
              </h3>
              {detail.players.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No players registered yet.</p>
              ) : (
                <ul className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
                  {detail.players.map((p) => (
                    <li key={p.userId} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-sm">{p.seed ? `#${p.seed}` : '·'}</span>
                      <span className="flex-1 text-sm font-semibold text-slate-900 dark:text-white">{p.displayName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {actionError && (
              <div className="mt-4 rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-600">
                {actionError}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              {detail.status === 'UPCOMING' && !detail.registered && (
                <Button
                  variant="primary"
                  onClick={() => void handleRegister()}
                  disabled={submitting || detail.registeredCount >= detail.maxPlayers}
                >
                  <Swords className="mr-1.5 h-4 w-4" />
                  {submitting ? 'Registering...' : 'Register'}
                </Button>
              )}
              {detail.registered && detail.status === 'UPCOMING' && (
                <Button variant="outline" onClick={() => void handleCancel()} disabled={submitting}>
                  {submitting ? 'Cancelling...' : 'Cancel registration'}
                </Button>
              )}
              {detail.registered && detail.status !== 'UPCOMING' && (
                <span className="rounded-xl bg-green-500/10 px-3 py-2 text-xs font-bold text-green-600">Registered</span>
              )}
              {detail.status === 'UPCOMING' && detail.registeredCount >= detail.maxPlayers && !detail.registered && (
                <span className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-bold text-red-600">Full</span>
              )}
              <Button variant="ghost" onClick={() => setDetail(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
