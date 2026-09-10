import { useEffect, useState } from 'react';
import { Trophy, Medal, Crown, Star, Gamepad2, ChevronLeft, ChevronRight, Search, Layers, Clock, User, Coins, Target } from 'lucide-react';
import { GAME_DEFINITIONS, TOURNAMENT_TIER_VISUALS } from '@gaming-hub/shared';
import type { GlobalTournamentLeaderboardEntry, GlobalTournamentLeaderboardResponse } from '@gaming-hub/shared';
import { tournamentsApi } from '../../services/api/enterprise';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';

const TIERS = [
  { code: 'all', name: 'All Tiers', icon: '🏆', color: 'text-amber-400' },
  { code: 'mini', name: 'Mini (5 Coins)', icon: '🟢', color: 'text-emerald-400' },
  { code: 'basic', name: 'Basic (10 Coins)', icon: '🔵', color: 'text-blue-400' },
  { code: 'standard', name: 'Standard (25 Coins)', icon: '🟣', color: 'text-purple-400' },
  { code: 'premium', name: 'Premium (50 Coins)', icon: '🟠', color: 'text-amber-400' },
  { code: 'pro', name: 'Pro (100 Coins)', icon: '🔴', color: 'text-rose-400' },
];

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="size-5 text-amber-500 fill-amber-500 inline" />;
  if (rank === 2) return <Medal className="size-5 text-slate-300 fill-slate-300 inline" />;
  if (rank === 3) return <Medal className="size-5 text-amber-700 fill-amber-700 inline" />;
  if (rank === 4) return <span className="inline-flex items-center justify-center size-5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold text-xs">4</span>;
  return <span className="text-sm font-bold text-slate-500">#{rank}</span>;
}

export function TournamentLeaderboardPage() {
  const [selectedGame, setSelectedGame] = useState<string>('all');
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [period, setPeriod] = useState<'all' | 'month' | 'week'>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<GlobalTournamentLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await tournamentsApi.globalLeaderboard({
          scope: selectedGame !== 'all' ? 'game' : selectedTier !== 'all' ? 'tier' : 'overall',
          gameId: selectedGame,
          tier: selectedTier,
          period,
          search: debouncedSearch,
          page,
          pageSize,
        });
        setData(res);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [page, period, selectedGame, selectedTier, debouncedSearch]);

  const items = data?.items || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || Math.ceil(total / pageSize) || 1;
  const top3 = items.slice(0, 3);
  const rest = items.slice(3);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          🏆 Tournament Leaderboard
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Server-authoritative skill rankings across all 5 tiers and 10 competitive game disciplines.
        </p>
      </div>

      {/* Viewer's Rank Sticky Banner */}
      {data?.myRank && (
        <div className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-purple-500/10 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500 font-black text-slate-950 text-base shadow">
                #{data.myRank.rank}
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-amber-500">Your Current Standing</div>
                <div className="text-sm font-black text-slate-900 dark:text-white">
                  Rank #{data.myRank.rank} • <span className="text-amber-500 font-mono">{data.myRank.points} Points</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-slate-400">Tournaments Won: </span>
                <span className="font-bold text-amber-400 font-mono">{data.myRank.tournamentsWon}</span>
              </div>
              <div>
                <span className="text-slate-400">Played: </span>
                <span className="font-bold text-slate-200 font-mono">{data.myRank.tournamentsPlayed}</span>
              </div>
              <div>
                <span className="text-slate-400">Match W/L: </span>
                <span className="font-bold text-emerald-400 font-mono">{data.myRank.matchWins}W</span> / <span className="font-bold text-rose-400 font-mono">{data.myRank.matchLosses}L</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Sections */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Tier Filter Bar */}
        <div className="space-y-1.5">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="size-3.5" /> Filter By Tier
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {TIERS.map((t) => (
              <button
                key={t.code}
                onClick={() => { setSelectedTier(t.code); setPage(1); }}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ${
                  selectedTier === t.code
                    ? 'bg-amber-500 text-slate-950 font-black shadow'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {t.icon} {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* Game Filter Bar */}
        <div className="space-y-1.5">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Gamepad2 className="size-3.5" /> Filter By Game
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => { setSelectedGame('all'); setPage(1); }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ${
                selectedGame === 'all'
                  ? 'bg-indigo-600 text-white font-black shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              🎮 All Games
            </button>
            {GAME_DEFINITIONS.map((g) => (
              <button
                key={g.id}
                onClick={() => { setSelectedGame(g.id); setPage(1); }}
                className={`rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ${
                  selectedGame === g.id
                    ? 'bg-indigo-600 text-white font-black shadow'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {g.icon} {g.name}
              </button>
            ))}
          </div>
        </div>

        {/* Search and Period Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search players by name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {[
              { value: 'all', label: 'All Time' },
              { value: 'month', label: 'This Month' },
              { value: 'week', label: 'This Week' },
            ].map((p) => (
              <button
                key={p.value}
                onClick={() => { setPeriod(p.value as any); setPage(1); }}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  period === p.value
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Trophy className="size-6" />}
          title="No leaderboard data"
          description="Tournament rankings will appear here once matches in this tier and game category are completed."
        />
      ) : (
        <>
          {/* Top 3 Podium */}
          {top3.length >= 3 && (
            <div className="grid grid-cols-3 gap-3">
              {[top3[1], top3[0], top3[2]].map((entry, i) => {
                if (!entry) return null;
                const actualRank = i === 0 ? 2 : i === 1 ? 1 : 3;

                return (
                  <Card key={entry.userId} className={actualRank === 1 ? 'border-amber-400/60 bg-amber-500/10 shadow-lg scale-105 z-10' : 'bg-slate-900/50'}>
                    <CardContent className="flex flex-col items-center p-4 text-center">
                      <RankBadge rank={actualRank} />
                      <div className="mt-2 text-sm sm:text-base font-black text-slate-900 dark:text-white truncate max-w-full">
                        {entry.displayName || entry.username}
                      </div>
                      <div className="mt-1 text-xs font-bold text-amber-500 font-mono">{entry.points} Points</div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        🏆 {entry.tournamentsWon} Won · {entry.tournamentsPlayed} Played
                      </div>
                      <div className="mt-1 text-[10px] font-mono text-emerald-400 flex items-center justify-center gap-1">
                        <Coins className="w-3 h-3 text-amber-400 inline-block" /> {entry.totalPrizesWon?.toLocaleString() ?? 0}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Leaderboard Table List */}
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((entry) => (
                  <div key={entry.userId} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <div className="w-8 text-center font-mono font-bold">
                      <RankBadge rank={entry.rank} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        {entry.displayName || entry.username}
                        {entry.rank <= 4 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold">
                            TOP 4
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {entry.tournamentsPlayed} Tournaments · {entry.tournamentsWon} 1st Place · {entry.topFourFinishes} Top 4 · {entry.matchWins}W/{entry.matchLosses}L
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-black text-amber-500">{entry.points} pts</p>
                      <p className="text-[11px] font-mono text-emerald-400 flex items-center justify-end gap-1">
                        <Coins className="w-3 h-3 text-amber-400 inline-block" /> {entry.totalPrizesWon?.toLocaleString() ?? 0}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs pt-2">
              <span className="text-slate-500">Page {page} of {totalPages} ({total} players)</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="gap-1">
                  <ChevronLeft className="size-3" /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="gap-1">
                  Next <ChevronRight className="size-3" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

