import { useEffect, useState } from 'react';
import {
  History,
  Search,
  Filter,
  Shield,
  Loader2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  User,
  Terminal,
  FileText,
  DollarSign,
  Gamepad2,
  RefreshCw,
  X,
  Lock,
  Eye,
} from 'lucide-react';
import { adminApi, type AuditLogEntry } from '../../services/api/enterprise';

const CATEGORY_STYLES: Record<string, string> = {
  report: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  auth: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
  account: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  admin: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
  security: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
  wallet: 'bg-violet-500/10 text-violet-400 border border-violet-500/20',
  game: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
  system: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
};

const CATEGORIES = [
  { id: '', label: 'All Logs', icon: History },
  { id: 'report', label: 'Reports', icon: FileText },
  { id: 'admin', label: 'Admin Actions', icon: Shield },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'auth', label: 'Auth & Session', icon: Shield },
  { id: 'wallet', label: 'Wallet', icon: DollarSign },
  { id: 'game', label: 'Game Engine', icon: Gamepad2 },
  { id: 'system', label: 'System', icon: Terminal },
  { id: 'account', label: 'Account', icon: User },
];

export function AdminAuditPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

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
    const metaStr = log.meta ? JSON.stringify(log.meta).toLowerCase() : '';
    return (
      log.action.toLowerCase().includes(q) ||
      (log.actorId && log.actorId.toLowerCase().includes(q)) ||
      (log.targetId && log.targetId.toLowerCase().includes(q)) ||
      (log.targetType && log.targetType.toLowerCase().includes(q)) ||
      (log.ip && log.ip.includes(q)) ||
      metaStr.includes(q)
    );
  });

  const totalPages = Math.ceil(total / pageSize) || 1;

  // Helper to format report metadata preview
  const renderReportDetails = (meta: Record<string, any>) => {
    const reportType = meta.reportType || 'REPORT';
    const dateLabel = meta.selectedDateRange?.label || meta.timeFilter || 'Custom';
    const game = meta.gameFilter && meta.gameFilter !== 'ALL' ? meta.gameFilter : 'All Games';
    const tier = meta.tierFilter && meta.tierFilter !== 'ALL' ? meta.tierFilter : 'All Tiers';
    const status = meta.tournamentStatusFilter && meta.tournamentStatusFilter !== 'ALL' ? meta.tournamentStatusFilter : 'All Statuses';
    const exportStatus = meta.exportStatus || 'SUCCESS';
    const totalRecords = meta.totalRecords !== undefined ? meta.totalRecords : null;

    return (
      <div className="flex flex-wrap items-center gap-1.5 py-1">
        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold text-[10px] border border-amber-500/30">
          {reportType}
        </span>
        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-medium border border-slate-200 dark:border-slate-700">
          📅 {dateLabel}
        </span>
        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-medium border border-slate-200 dark:border-slate-700">
          🎮 {game}
        </span>
        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-medium border border-slate-200 dark:border-slate-700">
          🏷️ {tier}
        </span>
        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-medium border border-slate-200 dark:border-slate-700">
          ⚡ {status}
        </span>
        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] border ${
          exportStatus === 'EXPORTED_CSV'
            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
            : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
        }`}>
          {exportStatus === 'EXPORTED_CSV' ? '📥 CSV EXPORT' : '👁️ PREVIEW'}
        </span>
        {totalRecords !== null && (
          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-mono border border-slate-200 dark:border-slate-700">
            {totalRecords} rows
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
      {/* Header Banner */}
      <div className="p-6 md:p-8 rounded-[2rem] bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-950 text-white shadow-xl shadow-indigo-950/20 border border-slate-800 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold mb-3">
              <History className="w-3.5 h-3.5 text-indigo-400" /> Immutable Trail
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Audit Trail Logs</h1>
            <p className="text-sm font-normal text-indigo-200 mt-1 max-w-xl">
              Track administrative report generation, operational actions, authentication attempts, and security events in real time.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void load()}
              className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-all"
              title="Refresh Audit Logs"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <div className="px-5 py-3 rounded-2xl bg-white/10 border border-white/20 text-white text-center shrink-0">
              <div className="text-2xl font-black">{total.toLocaleString()}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">Total Entries</div>
            </div>
          </div>
        </div>
      </div>

      {/* Category Navigation Pills (Admin -> Audit Logs -> Reports) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none no-scrollbar">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = category === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => {
                setCategory(cat.id);
                setPage(1);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-black scale-105'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{cat.label}</span>
              {cat.id === 'report' && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  REPORTS
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="flex items-center w-full sm:w-80 rounded-2xl bg-white dark:bg-slate-900 px-4 py-2.5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search report, action, admin, IP..."
            className="ml-3 w-full bg-transparent outline-none text-xs text-slate-900 dark:text-white placeholder-slate-400"
          />
        </div>

        {/* Category Select Dropdown */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-56 rounded-2xl bg-white dark:bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 outline-none shadow-sm cursor-pointer"
          >
            <option value="">All Categories</option>
            <option value="report">📊 Reports (Generation &amp; Export)</option>
            <option value="admin">🛡️ Admin Actions</option>
            <option value="security">🔒 Security</option>
            <option value="auth">🔑 Auth &amp; Session</option>
            <option value="wallet">💳 Wallet</option>
            <option value="game">🎮 Game Engine</option>
            <option value="system">⚙️ System</option>
            <option value="account">👤 Account</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs font-bold flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Audit Logs Container */}
      <div className="rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-xs font-bold text-slate-400">Loading audit logs...</p>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center">
            <History className="w-12 h-12 text-slate-600 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-bold text-slate-400">No audit log entries match your filter.</p>
            <p className="text-xs text-slate-500 mt-1">
              {category === 'report' ? 'Generate or export a tournament report in Admin → Tournaments → Reports to view logs here.' : 'Try clearing your search query or selecting a different category.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View (md and above) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-400 bg-slate-50/50 dark:bg-slate-800/30">
                    <th className="px-5 py-3.5">TIME</th>
                    <th className="px-5 py-3.5">CATEGORY</th>
                    <th className="px-5 py-3.5">ACTION</th>
                    <th className="px-5 py-3.5">ACTOR</th>
                    <th className="px-5 py-3.5">TARGET / SCOPE</th>
                    <th className="px-5 py-3.5">DETAILS</th>
                    <th className="px-5 py-3.5 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredItems.map((log) => {
                    const isReport = log.category === 'report' || log.action.includes('report');
                    const meta = (log.meta as Record<string, any>) || {};

                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                        onClick={() => setSelectedLog(log)}
                      >
                        <td className="px-5 py-4 whitespace-nowrap text-xs font-medium text-slate-500 dark:text-slate-400">
                          {new Date(log.createdAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                              CATEGORY_STYLES[log.category] ?? 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                            }`}
                          >
                            {log.category}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                          {log.action}
                        </td>
                        <td className="px-5 py-4 text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {log.actorType === 'user' ? (
                              <User className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                            )}
                            <span>{log.actorId ? `${log.actorType}:${log.actorId.slice(0, 8)}` : 'system'}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {isReport && meta.reportType ? (
                            <span className="font-bold text-amber-400">{meta.reportType}</span>
                          ) : log.targetType ? (
                            <span>
                              {log.targetType}
                              {log.targetId ? `:${log.targetId.slice(0, 8)}` : ''}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-xs">
                          {isReport && Object.keys(meta).length > 0 ? (
                            renderReportDetails(meta)
                          ) : log.meta ? (
                            <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-700 dark:text-slate-300 max-w-xs truncate block">
                              {JSON.stringify(log.meta)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-700 dark:text-slate-300 text-xs font-bold transition-all inline-flex items-center gap-1.5"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Inspect</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (Below md breakpoint) */}
            <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.map((log) => {
                const isReport = log.category === 'report' || log.action.includes('report');
                const meta = (log.meta as Record<string, any>) || {};

                return (
                  <div
                    key={log.id}
                    className="p-4 space-y-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    onClick={() => setSelectedLog(log)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          CATEGORY_STYLES[log.category] ?? 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                        }`}
                      >
                        {log.category}
                      </span>
                      <span className="text-[11px] font-medium text-slate-400">
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="font-mono text-xs font-bold text-indigo-400">
                      {log.action}
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-300">
                          {log.actorId ? `${log.actorType}:${log.actorId.slice(0, 8)}` : 'system'}
                        </span>
                      </div>
                      {log.ip && <span className="font-mono text-[11px] text-slate-500">{log.ip}</span>}
                    </div>

                    {isReport && Object.keys(meta).length > 0 ? (
                      renderReportDetails(meta)
                    ) : log.meta ? (
                      <div className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 p-2 rounded text-slate-700 dark:text-slate-300 truncate">
                        {JSON.stringify(log.meta)}
                      </div>
                    ) : null}

                    <div className="pt-1 flex justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(log);
                        }}
                        className="px-3 py-1 rounded-xl bg-slate-800 text-indigo-400 text-xs font-bold border border-slate-700 flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> Inspect Metadata
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Pagination Bar */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row items-center justify-between gap-3">
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
            <span className="px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
              {page} / {totalPages}
            </span>
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

      {/* Detailed Metadata Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">Audit Log Details</h3>
                  <p className="text-xs text-slate-400 font-mono">ID: {selectedLog.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Core Attributes Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Timestamp</div>
                  <div className="text-xs font-semibold text-white mt-1">
                    {new Date(selectedLog.createdAt).toLocaleString()}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Category</div>
                  <div className="text-xs font-bold text-amber-400 mt-1 uppercase">
                    {selectedLog.category}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Action</div>
                  <div className="text-xs font-mono font-bold text-indigo-400 mt-1">
                    {selectedLog.action}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Actor</div>
                  <div className="text-xs font-semibold text-white mt-1">
                    {selectedLog.actorId ? `${selectedLog.actorType}:${selectedLog.actorId}` : 'System'}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Target</div>
                  <div className="text-xs font-semibold text-white mt-1">
                    {selectedLog.targetType ? `${selectedLog.targetType}${selectedLog.targetId ? `:${selectedLog.targetId}` : ''}` : '—'}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[10px] font-bold uppercase text-slate-400">IP Address</div>
                  <div className="text-xs font-mono text-slate-300 mt-1">
                    {selectedLog.ip || '—'}
                  </div>
                </div>
              </div>

              {/* Specialized Report Parameter Breakdown */}
              {selectedLog.category === 'report' && selectedLog.meta && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Report Generation Scope &amp; Filters
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-500 font-bold">Report Type</div>
                      <div className="font-bold text-amber-400 mt-0.5">
                        {(selectedLog.meta as any).reportType || '—'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-500 font-bold">Date Range</div>
                      <div className="font-bold text-slate-200 mt-0.5">
                        {(selectedLog.meta as any).selectedDateRange?.label || (selectedLog.meta as any).timeFilter || '—'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-500 font-bold">Game Filter</div>
                      <div className="font-bold text-slate-200 mt-0.5">
                        {(selectedLog.meta as any).gameFilter || 'ALL'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-500 font-bold">Tier Filter</div>
                      <div className="font-bold text-slate-200 mt-0.5">
                        {(selectedLog.meta as any).tierFilter || 'ALL'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-500 font-bold">Status Filter</div>
                      <div className="font-bold text-slate-200 mt-0.5">
                        {(selectedLog.meta as any).tournamentStatusFilter || 'ALL'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-500 font-bold">Export Status</div>
                      <div className="font-bold text-emerald-400 mt-0.5">
                        {(selectedLog.meta as any).exportStatus || 'SUCCESS'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-500 font-bold">Total Records</div>
                      <div className="font-bold text-indigo-400 mt-0.5">
                        {(selectedLog.meta as any).totalRecords ?? '—'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-500 font-bold">Admin ID</div>
                      <div className="font-mono text-slate-300 mt-0.5 text-[11px] truncate">
                        {(selectedLog.meta as any).adminId || selectedLog.actorId || '—'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Full JSON Metadata Inspector */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Full Event Metadata (Sanitized)
                </h4>
                <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48 leading-relaxed">
                  {JSON.stringify(selectedLog.meta, null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
