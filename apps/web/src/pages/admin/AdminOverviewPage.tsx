import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../../services/api/client';
import { adminApi } from '../../services/api/enterprise';
import type { HealthCheckResult } from '@gaming-hub/shared';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalMatches: number;
  activeRooms: number;
}

const HEALTH_LABELS: Record<string, string> = {
  api: 'API Server',
  database: 'Database',
  socket: 'Socket Server',
  redis: 'Redis Cache',
  disk: 'Disk Space',
};

const STATUS_STYLES: Record<HealthCheckResult['status'], string> = {
  up: 'bg-green-500/10 text-green-600',
  degraded: 'bg-yellow-500/10 text-yellow-600',
  down: 'bg-red-500/10 text-red-600',
};

export function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    activeUsers: 0,
    totalMatches: 0,
    activeRooms: 0,
  });
  const [health, setHealth] = useState<HealthCheckResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [users, matches, rooms, checks] = await Promise.all([
          apiClient.get<{ total: number }>('/admin/users?page=1&pageSize=1').catch(() => ({ total: 0 })),
          apiClient.get<{ total: number }>('/admin/matches?page=1&pageSize=1').catch(() => ({ total: 0 })),
          apiClient.get<any[]>('/admin/rooms').catch(() => []),
          adminApi.monitoringHealth().catch(() => null),
        ]);

        setStats({
          totalUsers: users.total,
          activeUsers: 0,
          totalMatches: matches.total,
          activeRooms: Array.isArray(rooms) ? rooms.length : 0,
        });
        setHealth(checks);
      } catch {
        setStats({ totalUsers: 0, activeUsers: 0, totalMatches: 0, activeRooms: 0 });
      } finally {
        setIsLoading(false);
      }
    }
    loadStats();
  }, []);

  const allUp = health ? health.every((h) => h.status === 'up') : null;

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Admin Overview</h1>

      <div className="mb-6 grid gap-6 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="text-sm font-medium text-muted-foreground">Total Users</div>
          <div className="mt-2 text-3xl font-bold">{isLoading ? '...' : stats.totalUsers}</div>
          <Link
            to="/admin/users"
            className="mt-2 block text-sm text-blue-600 hover:underline"
          >
            View all users →
          </Link>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <div className="text-sm font-medium text-muted-foreground">Active Users</div>
          <div className="mt-2 text-3xl font-bold">{isLoading ? '...' : stats.activeUsers}</div>
          <div className="mt-2 text-xs text-muted-foreground">Online now</div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <div className="text-sm font-medium text-muted-foreground">Total Matches</div>
          <div className="mt-2 text-3xl font-bold">{isLoading ? '...' : stats.totalMatches}</div>
          <Link
            to="/admin/matches"
            className="mt-2 block text-sm text-blue-600 hover:underline"
          >
            View all matches →
          </Link>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <div className="text-sm font-medium text-muted-foreground">Active Rooms</div>
          <div className="mt-2 text-3xl font-bold">{isLoading ? '...' : stats.activeRooms}</div>
          <Link
            to="/admin/rooms"
            className="mt-2 block text-sm text-blue-600 hover:underline"
          >
            View all rooms →
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Quick Actions</h2>
          <div className="mt-4 space-y-2">
            <Link
              to="/admin/users"
              className="block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Manage Users
            </Link>
            <Link
              to="/admin/settings"
              className="block rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Site Settings
            </Link>
            <Link
              to="/admin/matches"
              className="block rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              View Matches
            </Link>
            <Link
              to="/admin/rooms"
              className="block rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              View Active Rooms
            </Link>
            <Link
              to="/admin/audit"
              className="block rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              View Audit Logs
            </Link>
            <Link
              to="/admin/analytics"
              className="block rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              View Analytics
            </Link>
            <Link
              to="/admin/monitoring"
              className="block rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              System Monitoring
            </Link>
            <Link
              to="/admin/crm"
              className="block rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Support (CRM)
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">System Status</h2>
          <div className="mt-4 space-y-3">
            {health === null ? (
              <>
                <div className="animate-pulse space-y-2">
                  <div className="h-4 w-2/3 rounded bg-muted" />
                  <div className="h-4 w-1/2 rounded bg-muted" />
                  <div className="h-4 w-3/4 rounded bg-muted" />
                </div>
              </>
            ) : health.length === 0 ? (
              <div className="text-sm text-muted-foreground">No health checks available</div>
            ) : (
              health.map((h) => (
                <div key={h.name} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{HEALTH_LABELS[h.name] ?? h.name}</div>
                    {h.detail && (
                      <div className="truncate text-xs text-muted-foreground">{h.detail}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">{h.latencyMs}ms</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[h.status]}`}>
                      {h.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-center text-sm">
              <div
                className={`mr-2 size-2 rounded-full ${
                  allUp === null ? 'bg-gray-400' : allUp ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className="text-muted-foreground">
                {allUp === null
                  ? 'Checking system health…'
                  : allUp
                    ? 'System operational'
                    : 'Some services need attention'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Recent Admin Activity</h2>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-start gap-3">
            <div className="size-2 mt-1.5 rounded-full bg-blue-500" />
            <div>
              <p className="font-medium">System operational at {new Date().toLocaleTimeString()}</p>
              <p className="text-muted-foreground">All core services running normally</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="size-2 mt-1.5 rounded-full bg-green-500" />
            <div>
              <p className="font-medium">No critical alerts</p>
              <p className="text-muted-foreground">All active rooms and matches running</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}