import { useEffect, useState } from 'react';
import { adminApi } from '../../services/api/enterprise';
import type { SystemMetrics, DashboardCounts, HealthCheckResult } from '@gaming-hub/shared';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function AdminMonitoringPage() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [health, setHealth] = useState<HealthCheckResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [m, c, h] = await Promise.all([
          adminApi.systemMetrics(),
          adminApi.monitoringCounts(),
          adminApi.monitoringHealth(),
        ]);
        setMetrics(m);
        setCounts(c);
        setHealth(h);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load monitoring data');
      } finally {
        setIsLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-600">
        <p className="font-medium">Failed to load monitoring data</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  const uptime = metrics ? `${Math.floor(metrics.uptimeSeconds / 86400)}d ${Math.floor((metrics.uptimeSeconds % 86400) / 3600)}h ${Math.floor((metrics.uptimeSeconds % 3600) / 60)}m` : '-';

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">System Monitoring</h1>

      <h2 className="mb-4 text-xl font-semibold">Service Health</h2>
      {health && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {health.map((check) => (
            <div key={check.name} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize text-muted-foreground">{check.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    check.status === 'up'
                      ? 'bg-green-500/10 text-green-600'
                      : check.status === 'degraded'
                        ? 'bg-yellow-500/10 text-yellow-600'
                        : 'bg-red-500/10 text-red-600'
                  }`}
                >
                  {check.status}
                </span>
              </div>
              <div className="mt-1.5 text-lg font-semibold">{check.latencyMs}ms</div>
              {check.detail && <div className="mt-0.5 text-xs text-muted-foreground">{check.detail}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Uptime" value={uptime} />
        <StatCard
          label="CPU Usage"
          value={metrics ? `${metrics.cpuUsage.toFixed(1)}%` : '-'}
          color={metrics && metrics.cpuUsage > 80 ? 'text-red-600' : undefined}
        />
        <StatCard
          label="Memory (RSS)"
          value={metrics ? formatBytes(metrics.memory.rss) : '-'}
        />
        <StatCard label="Active Connections" value={String(metrics?.activeConnections ?? '-')} />
      </div>

      {metrics && (
        <div className="mb-8 rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-lg font-semibold">Process Memory</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-sm text-muted-foreground">Heap Used</div>
              <div className="text-xl font-semibold">{formatBytes(metrics.memory.heapUsed)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Heap Total</div>
              <div className="text-xl font-semibold">{formatBytes(metrics.memory.heapTotal)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Heap Used %</div>
              <div className="text-xl font-semibold">
                {metrics.memory.heapTotal ? ((metrics.memory.heapUsed / metrics.memory.heapTotal) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${metrics.memory.heapTotal ? Math.min(100, (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Last updated: {new Date(metrics.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}

      <h2 className="mb-4 text-xl font-semibold">Platform Counts</h2>
      {counts && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Users" value={String(counts.users)} />
          <StatCard label="Users Online" value={String(counts.onlineUsers)} />
          <StatCard label="New Users Today" value={String(counts.newUsersToday)} />
          <StatCard label="Matches" value={String(counts.matches)} />
          <StatCard label="Live Matches" value={String(counts.liveMatches)} />
          <StatCard label="Rooms" value={String(counts.rooms)} />
          <StatCard label="Transactions" value={String(counts.transactions)} />
          <StatCard label="Volume" value={counts.transactionVolume.toLocaleString()} />
          <StatCard label="Tournaments" value={String(counts.tournaments)} />
          <StatCard label="Referrals" value={String(counts.referrals)} />
          <StatCard
            label="Support Tickets"
            value={String(counts.supportTickets)}
            color={counts.openTickets > 0 ? 'text-yellow-600' : undefined}
          />
          <StatCard
            label="Errors Today"
            value={String(counts.errorsToday)}
            color={counts.errorsToday > 0 ? 'text-red-600' : undefined}
          />
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color ?? ''}`}>{value}</div>
    </div>
  );
}
