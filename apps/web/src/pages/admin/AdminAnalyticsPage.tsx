import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../services/api/enterprise';
import type {
  AnalyticsSeriesPoint,
  AnalyticsSnapshot,
  CouponUsageStat,
  CountryDistributionPoint,
  SupportStats,
  TournamentParticipationStat,
} from '@gaming-hub/shared';

const DAYS = 30;

export function AdminAnalyticsPage() {
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [users, setUsers] = useState<AnalyticsSeriesPoint[]>([]);
  const [transactions, setTransactions] = useState<AnalyticsSeriesPoint[]>([]);
  const [deposits, setDeposits] = useState<AnalyticsSeriesPoint[]>([]);
  const [withdrawals, setWithdrawals] = useState<AnalyticsSeriesPoint[]>([]);
  const [coupons, setCoupons] = useState<CouponUsageStat[]>([]);
  const [tournaments, setTournaments] = useState<TournamentParticipationStat[]>([]);
  const [geography, setGeography] = useState<CountryDistributionPoint[]>([]);
  const [support, setSupport] = useState<SupportStats | null>(null);
  const [games, setGames] = useState<Array<{ gameId: string; matches: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [snap, u, t, d, w, c, tour, geo, s, g] = await Promise.all([
          adminApi.analyticsSnapshot(),
          adminApi.analyticsUsers(DAYS),
          adminApi.analyticsTransactions(DAYS),
          adminApi.analyticsDeposits(DAYS),
          adminApi.analyticsWithdrawals(DAYS),
          adminApi.analyticsCoupons(),
          adminApi.analyticsTournaments(),
          adminApi.analyticsGeography(),
          adminApi.analyticsSupport(),
          adminApi.analyticsGames(),
        ]);
        setSnapshot(snap);
        setUsers(u);
        setTransactions(t);
        setDeposits(d);
        setWithdrawals(w);
        setCoupons(c);
        setTournaments(tour);
        setGeography(geo);
        setSupport(s);
        setGames(g);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const userMax = useMemo(() => Math.max(1, ...users.map((p) => p.value)), [users]);
  const txMax = useMemo(() => Math.max(1, ...transactions.map((p) => p.value)), [transactions]);
  const depositMax = useMemo(() => Math.max(1, ...deposits.map((p) => p.value)), [deposits]);
  const withdrawalMax = useMemo(() => Math.max(1, ...withdrawals.map((p) => p.value)), [withdrawals]);
  const couponMax = useMemo(() => Math.max(1, ...coupons.map((c) => c.redemptions)), [coupons]);
  const gameMax = useMemo(() => Math.max(1, ...games.map((g) => g.matches)), [games]);
  const countryMax = useMemo(() => Math.max(1, ...geography.map((g) => g.users)), [geography]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Analytics</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-600">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {snapshot && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Revenue" value={snapshot.revenue.toLocaleString()} />
          <StatCard label="Total Wagers" value={snapshot.wagers.toLocaleString()} />
          <StatCard label="Payouts" value={snapshot.payouts.toLocaleString()} />
          <StatCard label="Deposits" value={snapshot.deposits.toLocaleString()} />
          <StatCard label="Withdrawals" value={snapshot.withdrawals.toLocaleString()} />
          <StatCard label="New Users" value={String(snapshot.newUsers)} />
          <StatCard label="Active Users" value={String(snapshot.activeUsers)} />
          <StatCard label="Matches" value={String(snapshot.matches)} />
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title={`User Growth (${DAYS} days)`}>
          <BarChart data={users} max={userMax} unit="" />
        </ChartCard>
        <ChartCard title={`Transactions (${DAYS} days)`}>
          <BarChart data={transactions} max={txMax} unit="" />
        </ChartCard>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title={`Deposits (${DAYS} days)`}>
          <BarChart data={deposits} max={depositMax} unit=" coins" />
        </ChartCard>
        <ChartCard title={`Withdrawals (${DAYS} days)`}>
          <BarChart data={withdrawals} max={withdrawalMax} unit=" coins" />
        </ChartCard>
      </div>

      {support && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-lg font-semibold">Support Overview</h2>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Open" value={String(support.open)} />
            <StatCard label="Pending" value={String(support.pending)} />
            <StatCard label="Resolved" value={String(support.resolved)} />
            <StatCard label="Closed" value={String(support.closed)} />
            <StatCard label="High Priority" value={String(support.highPriority)} color={support.highPriority > 0 ? 'text-red-600' : undefined} />
            <StatCard label="Unassigned" value={String(support.unassigned)} color={support.unassigned > 0 ? 'text-yellow-600' : undefined} />
          </div>
        </div>
      )}

      {coupons.length > 0 && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-lg font-semibold">Top Coupon Redemptions</h2>
          <div className="space-y-3">
            {coupons.map((c) => (
              <div key={c.code}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">{c.code} · {c.title}</span>
                  <span className="text-muted-foreground">
                    {c.redemptions}× · {c.value.toLocaleString()} coins
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${(c.redemptions / couponMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tournaments.length > 0 && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-lg font-semibold">Tournament Participation</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2">Tournament</th>
                  <th className="px-3 py-2">Format</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Registered</th>
                  <th className="px-3 py-2">Prize Pool</th>
                </tr>
              </thead>
              <tbody>
                {tournaments.map((t) => (
                  <tr key={t.title} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium">{t.title}</td>
                    <td className="px-3 py-2">{t.format}</td>
                    <td className="px-3 py-2">{t.status}</td>
                    <td className="px-3 py-2">{t.registeredCount}</td>
                    <td className="px-3 py-2">{t.prizePool.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {geography.length > 0 && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-lg font-semibold">Users by Country</h2>
          <div className="space-y-3">
            {geography.map((g) => (
              <div key={g.country ?? 'unknown'}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">{g.country ?? 'Unknown'}</span>
                  <span className="text-muted-foreground">{g.users}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-violet-500"
                    style={{ width: `${(g.users / countryMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {games.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-lg font-semibold">Matches by Game</h2>
          <div className="space-y-3">
            {games.map((g) => (
              <div key={g.gameId}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">{g.gameId}</span>
                  <span className="text-muted-foreground">{g.matches}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(g.matches / gameMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color ?? ''}`}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function BarChart({ data, max, unit }: { data: AnalyticsSeriesPoint[]; max: number; unit: string }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No data yet</p>;
  }
  return (
    <div className="flex h-40 items-end gap-1">
      {data.map((p) => (
        <div key={p.date} className="group flex flex-1 flex-col items-center">
          <div
            className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary"
            style={{ height: `${Math.max(2, (p.value / max) * 140)}px` }}
            title={`${p.date}: ${p.value}${unit}`}
          />
        </div>
      ))}
    </div>
  );
}
