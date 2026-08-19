import { useEffect, useState } from 'react';
import { Trophy, History, ChevronLeft, ChevronRight } from 'lucide-react';
import { GAME_DEFINITIONS } from '@gaming-hub/shared';
import type { TournamentHistoryEntry } from '@gaming-hub/shared';
import { tournamentsApi } from '../../services/api/enterprise';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';

const gameById = new Map(GAME_DEFINITIONS.map((g) => [g.id, g]));

export function TournamentHistoryPage() {
  const [items, setItems] = useState<TournamentHistoryEntry[]>([]);
  const [stats, setStats] = useState<{ tournamentsPlayed: number; tournamentsWon: number; finalsReached: number; topThreeFinishes: number; totalEntryFees: number; totalPrizesWon: number; bestRank: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [history, playerStats] = await Promise.allSettled([
          tournamentsApi.history(page, pageSize),
          page === 1 ? tournamentsApi.stats() : Promise.resolve(null),
        ]);
        if (history.status === 'fulfilled') {
          setItems(history.value.items);
          setTotal(history.value.total);
        }
        if (playerStats.status === 'fulfilled' && playerStats.value) {
          setStats(playerStats.value);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [page]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Tournament History</h1>
        <p className="mt-1 text-sm text-slate-500">Your past tournament performances.</p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-black text-slate-900 dark:text-white">{stats.tournamentsPlayed}</p>
              <p className="text-[10px] font-semibold uppercase text-slate-500">Played</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-black text-amber-500">{stats.tournamentsWon}</p>
              <p className="text-[10px] font-semibold uppercase text-slate-500">Won</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-black text-indigo-500">{stats.finalsReached}</p>
              <p className="text-[10px] font-semibold uppercase text-slate-500">Finals</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-black text-emerald-500">🪙 {stats.totalPrizesWon.toLocaleString()}</p>
              <p className="text-[10px] font-semibold uppercase text-slate-500">Prizes Won</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* History list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4" /> Recent Tournaments
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={<Trophy className="size-6" />} title="No tournament history" description="Join a tournament to see your history here." />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((entry) => {
                const game = gameById.get(entry.gameId);
                const won = entry.finalRank === 1;
                return (
                  <div key={entry.tournamentId} className="flex items-center gap-4 px-5 py-3">
                    <span className="text-xl">{game?.icon ?? '🏆'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{entry.title}</p>
                      <p className="text-xs text-slate-500">{game?.name ?? entry.gameId} · {new Date(entry.startTime).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${won ? 'text-amber-500' : entry.prizeWon > 0 ? 'text-emerald-500' : 'text-slate-500'}`}>
                        {entry.finalRank ? `#${entry.finalRank}` : '—'}
                      </p>
                      {entry.prizeWon > 0 && (
                        <p className="text-[10px] text-emerald-500">+{entry.prizeWon.toLocaleString()}</p>
                      )}
                    </div>
                    <Badge variant={
                      entry.status === 'SETTLED' ? 'success' :
                      entry.status === 'COMPLETED' ? 'accent' : 'outline'
                    } className="shrink-0">
                      {entry.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">Page {page} / {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="size-4" /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
