import { useEffect, useState } from 'react';
import { History, Search, Filter, Shield, Loader2, XCircle, ChevronLeft, ChevronRight, User, Terminal } from 'lucide-react';
import { adminApi, type AuditLogEntry } from '../../services/api/enterprise';

const CATEGORY_STYLES: Record<string, string> = {
  auth: 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20',
  account: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
  admin: 'bg-rose-500/10 text-rose-500 border border-rose-500/20',
  security: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
  wallet: 'bg-violet-500/10 text-violet-500 border border-violet-500/20',
  game: 'bg-cyan-500/10 text-cyan-500 border border-cyan-500/20',
  system: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
};

export function AdminAuditPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.auditLogs(page, pageSize, category || undefined);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [category, page]);

  const filteredItems = items.filter((log) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      (log.actorId && log.actorId.toLowerCase().includes(q)) ||
      (log.targetId && log.targetId.toLowerCase().includes(q)) ||
      (log.ip && log.ip.includes(q))
    );
  });

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 md:p-8 rounded-[2rem] bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white shadow-xl shadow-indigo-950/20 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold mb-3">
              <History className="w-3.5 h-3.5 text-indigo-400" /> Immutable Trail
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Audit Trail Logs</h1>
            <p className="text-sm font-normal text-indigo-200 mt-1 max-w-xl">
              Track administrative actions, authentication attempts, security events, and platform events in real time.
            </p>
          </div>
          <div className="px-5 py-3 rounded-2xl bg-white/10 border border-white/20 text-white text-center shrink-0">
            <div className="text-2xl font-black">{total.toLocaleString()}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">Total Entries</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="flex items-center w-full sm:w-80 rounded-2xl bg-white dark:bg-slate-900 px-4 py-2.5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search action, actor, IP..."
            className="ml-3 w-full bg-transparent outline-none text-xs text-slate-900 dark:text-white placeholder-slate-400"
          />
        </div>

        {/* Category Select */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-48 rounded-2xl bg-white dark:bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 outline-none shadow-sm cursor-pointer"
          >
            <option value="">All Categories</option>
            <option value="auth">Auth & Session</option>
            <option value="account">Account</option>
            <option value="admin">Admin Actions</option>
            <option value="security">Security</option>
            <option value="wallet">Wallet</option>
            <option value="game">Game Engine</option>
            <option value="system">System</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs font-bold flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Audit Table Card */}
      <div className="rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-xs font-bold text-slate-400">Loading audit logs...</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-400 bg-slate-50/50 dark:bg-slate-800/30">
                  <th className="px-6 py-3.5">TIME</th>
                  <th className="px-6 py-3.5">CATEGORY</th>
                  <th className="px-6 py-3.5">ACTION</th>
                  <th className="px-6 py-3.5">ACTOR</th>
                  <th className="px-6 py-3.5">TARGET</th>
                  <th className="px-6 py-3.5">DETAILS</th>
                  <th className="px-6 py-3.5">IP ADDRESS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredItems.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-medium text-slate-500 dark:text-slate-400">
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          CATEGORY_STYLES[log.category] ?? 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                        }`}
                      >
                        {log.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      {log.action}
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        {log.actorType === 'user' ? (
                          <User className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                        )}
                        <span>{log.actorId ? `${log.actorType}:${log.actorId.slice(0, 8)}` : 'system'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400">
                      {log.targetType ? (
                        <span>
                          {log.targetType}
                          {log.targetId ? `:${log.targetId.slice(0, 8)}` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 max-w-xs truncate text-xs text-slate-500 dark:text-slate-400">
                      {log.meta ? (
                        <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-700 dark:text-slate-300">
                          {JSON.stringify(log.meta)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {log.ip ?? '-'}
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-xs font-semibold text-slate-400">
                      No audit log entries match your filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Showing Page {page} of {totalPages} ({total} Total Records)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
