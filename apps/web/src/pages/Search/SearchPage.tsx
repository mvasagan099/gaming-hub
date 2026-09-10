import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  User,
  Gamepad2,
  Swords,
  Calendar,
  Award,
  LifeBuoy,
  Ticket,
  Clock,
  X,
  Sparkles,
  ChevronRight,
  Coins,
} from 'lucide-react';
import { searchApi } from '../../services/api/enterprise';
import { GAME_DEFINITIONS } from '@gaming-hub/shared';
import type { SearchResults, SearchType } from '@gaming-hub/shared';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/ui/Button';

const gameById = new Map(GAME_DEFINITIONS.map((g) => [g.id, g]));

type TabType = 'GLOBAL' | 'GAMES' | 'PLAYERS' | 'TOURNAMENTS' | 'EVENTS' | 'ACHIEVEMENTS';

const TABS: Array<{ id: TabType; label: string; icon: any }> = [
  { id: 'GLOBAL', label: 'All', icon: Sparkles },
  { id: 'GAMES', label: 'Games', icon: Gamepad2 },
  { id: 'PLAYERS', label: 'Players', icon: User },
  { id: 'TOURNAMENTS', label: 'Tournaments', icon: Swords },
  { id: 'EVENTS', label: 'Events', icon: Calendar },
  { id: 'ACHIEVEMENTS', label: 'Achievements', icon: Award },
];

export const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') ?? '';
  const typeParam = (searchParams.get('type') ?? 'GLOBAL').toUpperCase() as TabType;

  const [input, setInput] = useState(queryParam);
  const [activeTab, setActiveTab] = useState<TabType>(typeParam);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ query: string; type: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state when URL params change
  useEffect(() => {
    if (queryParam !== input) {
      setInput(queryParam);
    }
  }, [queryParam]);

  // Fetch search suggestions / recent history
  useEffect(() => {
    searchApi
      .suggestions(input || '')
      .then((s) => setSuggestions(s))
      .catch(() => setSuggestions([]));
  }, [input]);

  // Debounced execution of search requests
  useEffect(() => {
    const trimmed = input.trim();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!trimmed || trimmed.length < 2) {
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    debounceTimerRef.current = setTimeout(() => {
      // Update query param smoothly
      setSearchParams(
        { q: trimmed, ...(activeTab !== 'GLOBAL' ? { type: activeTab } : {}) },
        { replace: true }
      );

      searchApi
        .search(trimmed, activeTab)
        .then((res) => {
          setResults(res);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Search request failed');
        })
        .finally(() => {
          setLoading(false);
        });
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [input, activeTab, setSearchParams]);

  const handleClearHistory = async () => {
    try {
      await searchApi.clearHistory();
      setSuggestions([]);
    } catch {
      // Ignored
    }
  };

  const handleSelectSuggestion = (suggestedQuery: string) => {
    setInput(suggestedQuery);
    setShowSuggestions(false);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
          Global Search
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Discover games, players, tournaments, events, and achievements across the hub.
        </p>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="absolute left-4 h-5 w-5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search games, players, tournaments, events..."
            className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 pl-12 pr-10 py-3.5 text-base text-slate-900 dark:text-white placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
          />
          {input && (
            <button
              onClick={() => {
                setInput('');
                setResults(null);
              }}
              className="absolute right-3.5 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Suggestions / Recent Searches Dropdown */}
        {showSuggestions && suggestions.length > 0 && !results && (
          <div className="absolute top-full left-0 right-0 mt-2 z-30 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-500">
              <span className="flex items-center gap-1.5">
                <Clock size={13} /> Recent Searches
              </span>
              <button
                onClick={handleClearHistory}
                className="text-xs text-indigo-500 hover:text-indigo-400 transition-colors"
              >
                Clear all
              </button>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {suggestions.map((item, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => handleSelectSuggestion(item.query)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <span>{item.query}</span>
                    <span className="text-[11px] font-medium text-slate-400 capitalize">{item.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setShowSuggestions(false);
              }}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-medium text-red-500">
          {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      )}

      {/* Empty Query / Idle State */}
      {!loading && !input.trim() && (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-12 text-center">
          <Search className="mx-auto h-10 w-10 text-slate-400" />
          <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">
            Search the Gaming Hub
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Type at least 2 characters to search for your favorite games, players, tournaments, events, and achievements.
          </p>
        </div>
      )}

      {/* No Results Found */}
      {!loading && input.trim().length >= 2 && results && results.total === 0 && (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-12 text-center">
          <Search className="mx-auto h-10 w-10 text-slate-400" />
          <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">
            No matches found
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            We couldn’t find anything matching “<span className="font-semibold text-slate-900 dark:text-white">{input}</span>”.
          </p>
        </div>
      )}

      {/* Results Groups */}
      {!loading && results && results.total > 0 && (
        <div className="space-y-8">
          {/* 1. Games Results */}
          {results.games && results.games.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                  <Gamepad2 size={16} className="text-indigo-500" /> Games
                  <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-600 dark:text-indigo-400">
                    {results.games.length}
                  </span>
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {results.games.map((g) => (
                  <Link
                    key={g.gameId}
                    to={`/games/${g.gameId}`}
                    className="group flex items-center gap-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3.5 hover:border-indigo-500/50 hover:shadow-md transition-all"
                  >
                    <span className="text-3xl p-2 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      {g.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-500 transition-colors">
                        {g.name}
                      </p>
                      <p className="truncate text-xs text-slate-500">{g.description}</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* 2. Players Results */}
          {((results.players && results.players.length > 0) || (results.users && results.users.length > 0)) && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                  <User size={16} className="text-emerald-500" /> Players
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                    {(results.players || results.users).length}
                  </span>
                </h2>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
                {(results.players || results.users).map((u) => (
                  <li key={u.id}>
                    <Link
                      to={`/profile/${u.id}`}
                      className="group flex items-center gap-3.5 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="relative">
                        <span className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-sm font-black">
                          {u.displayName.slice(0, 1).toUpperCase()}
                        </span>
                        {u.isOnline && (
                          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors">
                          {u.displayName}
                        </p>
                        <p className="text-xs text-slate-500">
                          @{u.username} · Level {u.level ?? 1} · ⭐ {u.globalRating ?? 1200}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-slate-500">
                        {u.wins ?? 0} wins
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 3. Tournaments Results */}
          {results.tournaments && results.tournaments.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                  <Swords size={16} className="text-amber-500" /> Tournaments
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                    {results.tournaments.length}
                  </span>
                </h2>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
                {results.tournaments.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/tournaments/${t.id}`}
                      className="group flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <span className="text-2xl p-2 rounded-xl bg-amber-500/10 text-amber-500">
                        {gameById.get(t.gameId)?.icon ?? '🏆'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-amber-500 transition-colors">
                          {t.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {gameById.get(t.gameId)?.name ?? t.gameId} · {new Date(t.startTime).toLocaleDateString()} · {t.registeredCount}/{t.maxPlayers} players
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-amber-500 flex items-center justify-end gap-1">
                          <Coins className="w-3.5 h-3.5 text-amber-400" /> {t.prizePool.toLocaleString()}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">
                          {t.status}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 4. Events Results */}
          {results.events && results.events.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                  <Calendar size={16} className="text-rose-500" /> Events & Promotions
                  <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-xs text-rose-600 dark:text-rose-400">
                    {results.events.length}
                  </span>
                </h2>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
                {results.events.map((e) => (
                  <li key={e.id}>
                    <Link
                      to="/announcements"
                      className="group flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <span className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
                        <Calendar size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-rose-500 transition-colors">
                          {e.title}
                        </p>
                        <p className="truncate text-xs text-slate-500">{e.description}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${e.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                        {e.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 5. Achievements Results */}
          {results.achievements && results.achievements.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                  <Award size={16} className="text-purple-500" /> Achievements
                  <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-xs text-purple-600 dark:text-purple-400">
                    {results.achievements.length}
                  </span>
                </h2>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
                {results.achievements.map((a) => (
                  <li key={a.id}>
                    <Link
                      to="/achievements"
                      className="group flex items-center gap-3.5 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <span className="text-2xl p-2 rounded-xl bg-purple-500/10">
                        {a.icon || '🏅'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-500 transition-colors">
                          {a.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {a.category} · {a.rarity} · {a.description}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-purple-500">
                        +{a.xpReward} XP
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 6. Support Tickets (if applicable) */}
          {results.tickets && results.tickets.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                <LifeBuoy size={16} className="text-sky-500" /> Tickets ({results.tickets.length})
              </h2>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
                {results.tickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{t.subject}</p>
                      <p className="text-xs text-slate-500">{t.category} · {t.status}</p>
                    </div>
                    <Link to="/tickets" className="text-xs font-bold text-indigo-500 hover:underline">View</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 7. Coupons (if applicable) */}
          {results.coupons && results.coupons.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                <Ticket size={16} className="text-emerald-500" /> Coupons ({results.coupons.length})
              </h2>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
                {results.coupons.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{c.title}</p>
                      <p className="text-xs text-slate-500">{c.code}</p>
                    </div>
                    <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                      <Coins className="w-3.5 h-3.5 text-amber-400" /> {c.value}
                    </span>
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
