import { useEffect, useState } from 'react';
import { Trophy, Medal, Crown, Star, Gamepad2, ChevronLeft, ChevronRight } from 'lucide-react';
import { GAME_DEFINITIONS } from '@gaming-hub/shared';
import type { TournamentLeaderboardEntry, GameTournamentRankingEntry } from '@gaming-hub/shared';
import { tournamentsApi } from '../../services/api/enterprise';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="size-5 text-amber-500 fill-amber-500" />;
  if (rank === 2) return <Medal className="size-5 text-slate-400 fill-slate-400" />;
  if (rank === 3) return <Medal className="size-5 text-amber-700 fill-amber-700" />;
  return <span className="text-sm font-bold text-slate-500">#{rank}</span>;
}

export function TournamentLeaderboardPage() {
  const [selectedGame, setSelectedGame] = useState<string>('all');
  const [items, setItems] = useState<TournamentLeaderboardEntry[]>([]);
  const [gameItems, setGameItems] = useState<GameTournamentRankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [period, setPeriod] = useState('all');
  const pageSize = 20;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (selectedGame === 'all') {
          const data = await tournamentsApi.leaderboard({ page, pageSize, period });
          setItems(data.items);
          setTotal(data.total);
        } else {
          const data = await tournamentsApi.gameTournamentRankings(selectedGame, { page, pageSize });
          setGameItems(data.items);
          setTotal(data.total);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [page, period, selectedGame]);

  const isGlobal = selectedGame === 'all';
  const displayItems = isGlobal ? items : gameItems;
  const totalPages = Math.ceil(total / pageSize);
  const top3 = displayItems.slice(0, 3);
  const rest = displayItems.slice(3);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Tournament Leaderboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Authoritative tournament rankings across all time and individual game disciplines.
        </p>
      </div>

      {/* Game Filter Bar */}
      <div className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Filter By Game</div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => { setSelectedGame('all'); setPage(1); }}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ${
              selectedGame === 'all'
                ? 'bg-amber-500 text-slate-950 font-black shadow'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            🏆 All Games
          </button>
          {GAME_DEFINITIONS.map((g) => (
            <button
              key={g.id}
              onClick={() => { setSelectedGame(g.id); setPage(1); }}
              className={`rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ${
                selectedGame === g.id
                  ? 'bg-amber-500 text-slate-950 font-black shadow'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {g.icon} {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* Period filter for global view */}
      {isGlobal && (
        <div className="flex gap-1.5">
          {[
            { value: 'all', label: 'All Time' },
            { value: 'month', label: 'This Month' },
            { value: 'week', label: 'This Week' },
          ].map((p) => (
            <button
              key={p.value}
              onClick={() => { setPeriod(p.value); setPage(1); }}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                period === p.value
                  ? 'bg-indigo-500 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : displayItems.length === 0 ? (
        <EmptyState icon={<Trophy className="size-6" />} title="No leaderboard data" description="Tournament rankings will appear here once tournaments in this category are completed." />
      ) : (
        <>
          {/* Top 3 podium */}
          {top3.length >= 3 && (
            <div className="grid grid-cols-3 gap-3">
              {[top3[1], top3[0], top3[2]].map((entry: any, i) => {
                const actualRank = i === 0 ? 2 : i === 1 ? 1 : 3;
                const wins = isGlobal ? entry.wins : entry.tournamentsWon;
                const played = isGlobal ? entry.tournamentsPlayed : entry.tournamentsPlayed;
                const prize = isGlobal ? entry.totalPrizeWon : entry.totalPrizesWon;

                return (
                  <Card key={entry.userId} className={actualRank === 1 ? 'border-amber-400/50 bg-amber-500/5' : ''}>
                    <CardContent className="flex flex-col items-center p-4 text-center">
                      <RankBadge rank={actualRank} />
                      <div className="mt-2 text-base sm:text-lg font-black text-slate-900 dark:text-white truncate max-w-full">
                        {entry.displayName || entry.username}
                      </div>
                      <div className="mt-1 text-sm font-bold text-amber-500">{wins} tournament wins</div>
                      <div className="text-[10px] text-slate-500">
                        {played} tournaments · 🪙 {prize?.toLocaleString() ?? 0}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Rest of list */}
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {rest.map((entry: any) => {
                  const wins = isGlobal ? entry.wins : entry.tournamentsWon;
                  const played = isGlobal ? entry.tournamentsPlayed : entry.tournamentsPlayed;
                  const prize = isGlobal ? entry.totalPrizeWon : entry.totalPrizesWon;
                  const winRate = !isGlobal ? `${entry.winRate}% win rate` : `${entry.finalsReached} finals`;

                  return (
                    <div key={entry.userId} className="flex items-center gap-4 px-5 py-3.5 text-xs">
                      <div className="w-8 text-center font-mono font-bold"><RankBadge rank={entry.rank} /></div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                          {entry.displayName || entry.username}
                        </p>
                        <p className="text-xs text-slate-500">{played} tournaments played · {winRate}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-amber-500">{wins} wins</p>
                        <p className="text-[11px] font-mono text-emerald-400">🪙 {prize?.toLocaleString() ?? 0}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Page {page} of {totalPages}</span>
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
