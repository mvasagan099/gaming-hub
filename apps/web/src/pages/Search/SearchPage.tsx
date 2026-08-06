import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, User, Gamepad2, Swords, LifeBuoy, Ticket } from 'lucide-react';
import { searchApi } from '../../services/api/enterprise';
import { GAME_DEFINITIONS } from '@gaming-hub/shared';
import type { SearchResults } from '@gaming-hub/shared';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/ui/Button';

const gameById = new Map(GAME_DEFINITIONS.map((g) => [g.id, g]));

export const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const [input, setInput] = useState(query);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchApi
      .search(query.trim())
      .then((r) => {
        if (!cancelled) setResults(r);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Search failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const submit = () => {
    if (input.trim()) setSearchParams({ q: input.trim() }, { replace: true });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Search</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Find players, games, and tournaments across the platform.
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Search..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3 py-2.5 text-sm"
          />
        </div>
        <Button variant="primary" onClick={submit} disabled={!input.trim()}>
          Search
        </Button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-600">{error}</div>
      )}

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {!loading && query && !error && !results && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Searching for “{query}”…</p>
      )}

      {results && results.total === 0 && (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-10 text-center">
          <Search className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            No results for “{query}”
          </p>
        </div>
      )}

      {results && results.total > 0 && (
        <div className="space-y-6">
          {results.users.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                <User size={14} className="text-indigo-500" /> Players ({results.users.length})
              </h2>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                {results.users.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 bg-white dark:bg-slate-900/60 px-4 py-3">
                    <span className="w-9 h-9 rounded-full bg-indigo-500/15 flex items-center justify-center text-indigo-500 text-sm font-black">
                      {u.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{u.displayName}</p>
                      <p className="text-[11px] text-slate-500">@{u.username}</p>
                    </div>
                    <span className={`h-2 w-2 rounded-full ${u.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.games.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                <Gamepad2 size={14} className="text-accent-500" /> Games ({results.games.length})
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {results.games.map((g) => (
                  <li key={g.gameId}>
                    <Link
                      to={`/games/${g.gameId}`}
                      className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-4 py-3 hover:border-accent-500/50 transition-colors"
                    >
                      <span className="text-xl">{g.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{g.name}</p>
                        <p className="truncate text-[11px] text-slate-500">{g.description}</p>
                      </div>
                      <span className="ml-auto shrink-0 text-[10px] font-bold text-emerald-500">
                        {g.playersOnline} online
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.tournaments.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                <Swords size={14} className="text-amber-500" /> Tournaments ({results.tournaments.length})
              </h2>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                {results.tournaments.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 bg-white dark:bg-slate-900/60 px-4 py-3">
                    <span className="text-xl">{gameById.get(t.gameId)?.icon ?? '🏆'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{t.title}</p>
                      <p className="text-[11px] text-slate-500">
                        {gameById.get(t.gameId)?.name ?? t.gameId} · {new Date(t.startTime).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-amber-500">🪙 {t.prizePool.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.tickets.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                <LifeBuoy size={14} className="text-sky-500" /> Support tickets ({results.tickets.length})
              </h2>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                {results.tickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 bg-white dark:bg-slate-900/60 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{t.subject}</p>
                      <p className="text-[11px] text-slate-500">
                        {t.category} · {t.status} · {new Date(t.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Link to="/tickets" className="text-xs font-bold text-accent-500">View</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.coupons.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                <Ticket size={14} className="text-emerald-500" /> Coupons ({results.coupons.length})
              </h2>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                {results.coupons.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 bg-white dark:bg-slate-900/60 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{c.title}</p>
                      <p className="text-[11px] text-slate-500">{c.code} · redeemed {new Date(c.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className="text-xs font-bold text-emerald-500">🪙 {c.value.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
