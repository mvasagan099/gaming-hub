import { useEffect, useState } from 'react';
import { adminApi, type AuditLogEntry } from '../../services/api/enterprise';

const CATEGORY_STYLES: Record<string, string> = {
  user: 'bg-blue-500/10 text-blue-600',
  admin: 'bg-red-500/10 text-red-600',
  security: 'bg-yellow-500/10 text-yellow-600',
  game: 'bg-green-500/10 text-green-600',
  system: 'bg-gray-500/10 text-gray-600',
  payment: 'bg-purple-500/10 text-purple-600',
};

export function AdminAuditPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('');

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.auditLogs(1, 100, category || undefined);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [category]);

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
        <h1 className="text-3xl font-bold">Audit Logs</h1>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
          <option value="security">Security</option>
          <option value="game">Game</option>
          <option value="system">System</option>
          <option value="payment">Payment</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-600">
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr className="text-left text-sm text-muted-foreground">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {items.map((log) => (
              <tr key={log.id} className="border-b border-border">
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${CATEGORY_STYLES[log.category] ?? 'bg-gray-500/10 text-gray-600'}`}
                  >
                    {log.category}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <code className="text-xs">{log.action}</code>
                </td>
                <td className="px-4 py-3 text-sm">
                  {log.actorType}:{log.actorId.slice(0, 8)}
                </td>
                <td className="px-4 py-3 text-sm">
                  {log.targetType}
                  {log.targetId ? `:${log.targetId.slice(0, 8)}` : ''}
                </td>
                <td className="max-w-[260px] truncate px-4 py-3 text-xs text-muted-foreground">
                  {log.meta ? JSON.stringify(log.meta) : '-'}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{log.ip ?? '-'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No audit logs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
          Total: {total} log entries
        </div>
      </div>
    </div>
  );
}
