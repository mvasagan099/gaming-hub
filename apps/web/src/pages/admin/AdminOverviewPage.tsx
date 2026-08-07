import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Swords, Gamepad2, Activity, ArrowRight, ShieldAlert, CheckCircle2, AlertCircle, Clock, Zap } from 'lucide-react';
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
  up: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
  degraded: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
  down: 'bg-rose-500/10 text-rose-500 border border-rose-500/20',
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
          apiClient.get<unknown[]>('/admin/rooms').catch(() => []),
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
    void loadStats();
  }, []);

  const allUp = health ? health.every((h) => h.status === 'up') : null;

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero */}
      <div className="p-6 md:p-8 rounded-[2rem] bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white shadow-xl shadow-indigo-950/20 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold mb-3">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Control Center
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Admin System Overview</h1>
            <p className="text-sm font-normal text-indigo-200 mt-1 max-w-xl">
              Monitor active gaming traffic, system infrastructure health, and administrative workflows in real time.
            </p>
          </div>
          <Link
            to="/admin/monitoring"
            className="px-5 py-2.5 rounded-xl bg-white text-indigo-900 hover:bg-indigo-50 font-black text-xs transition-all shadow-md flex items-center gap-2 shrink-0"
          >
            <Activity className="w-4 h-4 text-indigo-600" />
            <span>Full System Diagnostics</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Users */}
        <div className="p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Users</span>
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900 dark:text-white">
            {isLoading ? <span className="animate-pulse">...</span> : stats.totalUsers}
          </div>
          <Link
            to="/admin/users"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            <span>Manage registered users</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Active Users */}
        <div className="p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Online</span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900 dark:text-white">
            {isLoading ? <span className="animate-pulse">...</span> : stats.activeUsers}
          </div>
          <div className="mt-3 text-xs font-bold text-emerald-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Online right now</span>
          </div>
        </div>

        {/* Total Matches */}
        <div className="p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Matches</span>
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Swords className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900 dark:text-white">
            {isLoading ? <span className="animate-pulse">...</span> : stats.totalMatches}
          </div>
          <Link
            to="/admin/matches"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline"
          >
            <span>Inspect match history</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Active Rooms */}
        <div className="p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Rooms</span>
            <div className="w-10 h-10 rounded-2xl bg-violet-500/10 text-violet-500 flex items-center justify-center">
              <Gamepad2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900 dark:text-white">
            {isLoading ? <span className="animate-pulse">...</span> : stats.activeRooms}
          </div>
          <Link
            to="/admin/rooms"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 dark:text-violet-400 hover:underline"
          >
            <span>Live multiplayer lobbies</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Main Grid: Quick Actions + System Status */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Quick Actions Card */}
        <div className="p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 shadow-sm">
          <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
            <Zap className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              to="/admin/users"
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-slate-200/80 dark:border-slate-700/60 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors flex items-center justify-between group"
            >
              <span>User Management</span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
            </Link>
            <Link
              to="/admin/settings"
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-slate-200/80 dark:border-slate-700/60 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors flex items-center justify-between group"
            >
              <span>Platform Settings</span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
            </Link>
            <Link
              to="/admin/features"
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-slate-200/80 dark:border-slate-700/60 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors flex items-center justify-between group"
            >
              <span>Feature Flags</span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
            </Link>
            <Link
              to="/admin/crm"
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-slate-200/80 dark:border-slate-700/60 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors flex items-center justify-between group"
            >
              <span>Support Desk</span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
            </Link>
            <Link
              to="/admin/audit"
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-slate-200/80 dark:border-slate-700/60 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors flex items-center justify-between group"
            >
              <span>Audit Trail</span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
            </Link>
            <Link
              to="/admin/analytics"
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-slate-200/80 dark:border-slate-700/60 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors flex items-center justify-between group"
            >
              <span>Analytics Center</span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
            </Link>
          </div>
        </div>

        {/* System Status Card */}
        <div className="p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 shadow-sm">
          <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
            <Activity className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-black text-slate-900 dark:text-white">System Infrastructure</h2>
          </div>
          <div className="space-y-3">
            {health === null ? (
              <div className="animate-pulse space-y-2 py-4">
                <div className="h-4 w-2/3 rounded-lg bg-slate-100 dark:bg-slate-800" />
                <div className="h-4 w-1/2 rounded-lg bg-slate-100 dark:bg-slate-800" />
              </div>
            ) : health.length === 0 ? (
              <div className="text-xs text-slate-400 py-4 text-center">No service health metrics reported.</div>
            ) : (
              health.map((h) => (
                <div
                  key={h.name}
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {HEALTH_LABELS[h.name] ?? h.name}
                    </div>
                    {h.detail && <div className="text-[11px] text-slate-400 truncate max-w-xs">{h.detail}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-400">{h.latencyMs}ms</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${STATUS_STYLES[h.status]}`}>
                      {h.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${allUp === null ? 'bg-slate-400' : allUp ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {allUp === null ? 'Checking health…' : allUp ? 'All services operational' : 'Attention required'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}