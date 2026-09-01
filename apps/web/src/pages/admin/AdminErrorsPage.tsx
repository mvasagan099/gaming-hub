import { useEffect, useState } from 'react';
import { adminApi } from '../../services/api/enterprise';
import type { ErrorEventView, ErrorStatus, ErrorSeverity } from '@gaming-hub/shared';

const STATUS_STYLES: Record<ErrorStatus, string> = {
  OPEN: 'bg-red-500/10 text-red-600',
  INVESTIGATING: 'bg-yellow-500/10 text-yellow-600',
  RESOLVED: 'bg-green-500/10 text-green-600',
  IGNORED: 'bg-gray-500/10 text-gray-600',
};

const SEVERITY_STYLES: Record<ErrorSeverity, string> = {
  LOW: 'bg-gray-500/10 text-gray-600',
  MEDIUM: 'bg-blue-500/10 text-blue-600',
  HIGH: 'bg-orange-500/10 text-orange-600',
  CRITICAL: 'bg-red-500/10 text-red-600',
};

interface ErrorStats {
  open: number;
  investigating: number;
  resolved: number;
  ignored: number;
  critical: number;
  high: number;
  total: number;
}

export function AdminErrorsPage() {
  const [items, setItems] = useState<ErrorEventView[]>([]);
  const [stats, setStats] = useState<ErrorStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('OPEN');

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [data, s] = await Promise.all([
        adminApi.errors(1, 100, statusFilter),
        adminApi.errorStats(),
      ]);
      setItems(data.items);
      setStats(s as ErrorStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load errors');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const handleStatus = async (id: string, status: ErrorStatus) => {
    setError(null);
    try {
      await adminApi.setErrorStatus(id, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update error status');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Error Center</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="INVESTIGATING">Investigating</option>
          <option value="RESOLVED">Resolved</option>
          <option value="IGNORED">Ignored</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-600">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total" value={String(stats.total)} />
          <StatCard label="Critical" value={String(stats.critical)} color="text-red-600" />
          <StatCard label="High" value={String(stats.high)} color="text-orange-600" />
          <StatCard label="Open" value={String(stats.open)} color="text-red-600" />
          <StatCard label="Investigating" value={String(stats.investigating)} color="text-yellow-600" />
          <StatCard label="Resolved" value={String(stats.resolved)} />
          <StatCard label="Ignored" value={String(stats.ignored)} />
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr className="text-left text-sm text-muted-foreground">
              <th className="px-4 py-3">Error</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Occurrences</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">First Seen</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} className="border-b border-border">
                <td className="max-w-[360px] px-4 py-3">
                  <div className="font-mono text-xs text-muted-foreground">{e.code}</div>
                  <div className="truncate font-medium">{e.message}</div>
                  {e.path && <div className="truncate text-xs text-muted-foreground">{e.method} {e.path}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs ${SEVERITY_STYLES[e.severity]}`}>
                    {e.severity}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs ${STATUS_STYLES[e.status]}`}>
                    {e.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">{e.count}</td>
                <td className="px-4 py-3 text-sm">{e.source ?? '-'}</td>
                <td className="px-4 py-3 text-sm">{new Date(e.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {e.status !== 'INVESTIGATING' && (
                      <button
                        onClick={() => handleStatus(e.id, 'INVESTIGATING')}
                        className="rounded bg-yellow-500 px-2 py-1 text-xs text-white hover:bg-yellow-600"
                      >
                        Investigate
                      </button>
                    )}
                    {e.status !== 'RESOLVED' && (
                      <button
                        onClick={() => handleStatus(e.id, 'RESOLVED')}
                        className="rounded bg-green-500 px-2 py-1 text-xs text-white hover:bg-green-600"
                      >
                        Resolve
                      </button>
                    )}
                    {e.status !== 'IGNORED' && (
                      <button
                        onClick={() => handleStatus(e.id, 'IGNORED')}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                      >
                        Ignore
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No errors found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
