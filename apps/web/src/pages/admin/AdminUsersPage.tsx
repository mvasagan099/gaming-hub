import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  X,
  Users,
  Search,
  Wallet,
  Shield,
  Eye,
  XCircle,
  Loader2,
} from 'lucide-react';
import { apiClient } from '../../services/api/client';
import { adminApi } from '../../services/api/enterprise';
import type { AdminCustomerDetail } from '@gaming-hub/shared';

interface User {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  isOnline: boolean;
  coins: number;
  level: number;
  createdAt: string;
}

interface UserListResponse {
  items: User[];
  total: number;
  page: number;
  pageSize: number;
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<UserListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [walletAmount, setWalletAmount] = useState(0);
  const [walletReason, setWalletReason] = useState('');
  const [newRole, setNewRole] = useState<'USER' | 'MODERATOR' | 'ADMIN'>('USER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  const openDetail = useCallback(async (userId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      setDetail(await adminApi.customerDetail(userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customer detail');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<UserListResponse>('/admin/users?page=1&pageSize=50');
      setUsers(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load users';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const userIdParam = searchParams.get('userId');

  useEffect(() => {
    if (!userIdParam) return;
    setSearchParams({}, { replace: true });
    void openDetail(userIdParam);
  }, [userIdParam, setSearchParams, openDetail]);

  const handleWalletAdjust = async () => {
    if (!selectedUser || !walletReason || walletAmount === 0) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.post(`/admin/users/${selectedUser.id}/wallet`, {
        amount: walletAmount,
        reason: walletReason,
      });
      setShowWalletModal(false);
      setWalletAmount(0);
      setWalletReason('');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to adjust wallet');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.patch(`/admin/users/${selectedUser.id}/role`, {
        role: newRole,
      });
      setShowRoleModal(false);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredUsers = users?.items.filter(
    (u) =>
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email ?? '').toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="p-6 md:p-8 rounded-[2rem] bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white shadow-xl shadow-indigo-950/20 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold mb-3">
              <Users className="w-3.5 h-3.5 text-indigo-400" /> User Directory
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">User & Role Management</h1>
            <p className="text-sm font-normal text-indigo-200 mt-1 max-w-xl">
              Inspect user balances, grant administrator roles, manage wallet credits, and view complete 360° customer analytics.
            </p>
          </div>
          <div className="px-5 py-3 rounded-2xl bg-white/10 border border-white/20 text-white text-center shrink-0">
            <div className="text-2xl font-black">{users?.total ?? 0}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">Registered Users</div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center w-full md:w-80 rounded-2xl bg-white dark:bg-slate-900 px-4 py-2.5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, username, email..."
            className="ml-3 w-full bg-transparent outline-none text-xs text-slate-900 dark:text-white placeholder-slate-400"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs font-bold flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-xs font-bold text-slate-400">Loading user accounts...</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-400 bg-slate-50/50 dark:bg-slate-800/30">
                  <th className="px-6 py-3.5">USER</th>
                  <th className="px-6 py-3.5">ROLE</th>
                  <th className="px-6 py-3.5">MAIN BALANCE</th>
                  <th className="px-6 py-3.5">LEVEL</th>
                  <th className="px-6 py-3.5">STATUS</th>
                  <th className="px-6 py-3.5">JOINED</th>
                  <th className="px-6 py-3.5 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredUsers?.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                          {user.displayName.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white text-sm">{user.displayName}</div>
                          <div className="text-xs text-slate-400 font-normal">@{user.username}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{user.email ?? 'No email'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wide uppercase ${
                          user.role === 'ADMIN'
                            ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20'
                            : user.role === 'MODERATOR'
                              ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20'
                              : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-extrabold text-slate-900 dark:text-white">
                      🪙 {user.coins.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300">
                      Lvl {user.level}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          user.isOnline
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                        }`}
                      >
                        {user.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-400">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => void openDetail(user.id)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-xs transition-colors flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>360 View</span>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowWalletModal(true);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold text-xs transition-colors flex items-center gap-1.5"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>Adjust Wallet</span>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setNewRole(user.role);
                            setShowRoleModal(true);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors flex items-center gap-1.5"
                        >
                          <Shield className="w-3.5 h-3.5" />
                          <span>Role</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showWalletModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Adjust Wallet Balance</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              User: <span className="font-bold text-slate-900 dark:text-white">{selectedUser.displayName}</span> (Current: 🪙 {selectedUser.coins.toLocaleString()})
            </p>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Amount (Positive to Add, Negative to Deduct)</label>
              <input
                type="number"
                value={walletAmount}
                onChange={(e) => setWalletAmount(e.target.valueAsNumber)}
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-xs text-slate-900 dark:text-white outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Reason</label>
              <input
                type="text"
                value={walletReason}
                onChange={(e) => setWalletReason(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-xs text-slate-900 dark:text-white outline-none"
                placeholder="Reason for adjustment"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowWalletModal(false);
                  setError(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleWalletAdjust}
                disabled={isSubmitting || !walletReason || walletAmount === 0}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSubmitting ? 'Adjusting...' : 'Confirm Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRoleModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Change User Role</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              User: <span className="font-bold text-slate-900 dark:text-white">{selectedUser.displayName}</span> (Current Role: <span className="font-bold text-indigo-500">{selectedUser.role}</span>)
            </p>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Select New Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as 'USER' | 'MODERATOR' | 'ADMIN')}
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer"
              >
                <option value="USER">User (Standard Access)</option>
                <option value="MODERATOR">Moderator (Match & Room Management)</option>
                <option value="ADMIN">Admin (Full System Access)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowRoleModal(false);
                  setError(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleRoleChange}
                disabled={isSubmitting || newRole === selectedUser.role}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSubmitting ? 'Updating...' : 'Save Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex justify-end" onClick={() => setDetail(null)}>
          <div
            className="w-full max-w-2xl h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl p-6 md:p-8 overflow-y-auto space-y-6 z-50 text-slate-900 dark:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-6 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 text-white font-black text-lg flex items-center justify-center shadow-md">
                  {detail.user.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-black">{detail.user.displayName}</h2>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>@{detail.user.username}</span>
                    <span>·</span>
                    <span>{detail.user.email ?? 'No email'}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 uppercase">
                      {detail.user.role}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${detail.user.isOnline ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-400'}`}>
                      {detail.user.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 transition-colors"
                aria-label="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              </div>
            ) : (
              <div className="space-y-6">
                {detail.profile && (
                  <Section title="Profile Stats">
                    <StatGrid
                      items={[
                        { label: 'Level', value: String(detail.profile.level) },
                        { label: 'XP', value: detail.profile.xp.toLocaleString() },
                        { label: 'W / L / D', value: `${detail.profile.wins} / ${detail.profile.losses} / ${detail.profile.draws}` },
                        { label: 'Country', value: detail.profile.country ?? '—' },
                      ]}
                    />
                  </Section>
                )}

                {detail.wallet && (
                  <Section title="Wallet Balances">
                    <StatGrid
                      items={[
                        { label: 'Main', value: `🪙 ${detail.wallet.balance.toLocaleString()}` },
                        { label: 'Bonus', value: `🪙 ${detail.wallet.bonusBalance.toLocaleString()}` },
                        { label: 'Locked', value: `🪙 ${detail.wallet.lockedBalance.toLocaleString()}` },
                        { label: 'Reward', value: `🪙 ${detail.wallet.rewardBalance.toLocaleString()}` },
                        { label: 'Cashback', value: `🪙 ${detail.wallet.cashbackBalance.toLocaleString()}` },
                      ]}
                    />
                  </Section>
                )}

                {detail.statistics.length > 0 && (
                  <Section title={`Game Stats (${detail.statistics.length})`}>
                    <Table
                      headers={['Game', 'Played', 'Wins', 'Rating']}
                      rows={detail.statistics.map((s) => [s.gameId ?? 'all', String(s.gamesPlayed), String(s.wins), String(s.rating)])}
                    />
                  </Section>
                )}

                {detail.transactions.length > 0 && (
                  <Section title={`Transactions (${detail.transactions.length})`}>
                    <Table
                      headers={['Date', 'Type', 'Amount', 'Wallet']}
                      rows={detail.transactions.map((t) => [
                        new Date(t.createdAt).toLocaleDateString(),
                        t.referenceType,
                        `${t.amount > 0 ? '+' : ''}${t.amount.toLocaleString()}`,
                        t.walletType,
                      ])}
                    />
                  </Section>
                )}

                {detail.sessions.length > 0 && (
                  <Section title={`Active Login Sessions (${detail.sessions.length})`}>
                    <Table
                      headers={['Device', 'IP Address', 'Created At']}
                      rows={detail.sessions.map((s) => [
                        `${s.deviceName ?? 'Windows PC'}${s.isCurrent ? ' (Current)' : ''}`,
                        s.ip ?? '127.0.0.1',
                        new Date(s.createdAt).toLocaleDateString(),
                      ])}
                    />
                  </Section>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{title}</h3>
      {children}
    </div>
  );
}

function StatGrid({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{item.label}</p>
          <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-100/60 dark:bg-slate-800/80">
            {headers.map((h) => (
              <th key={h} className="px-4 py-2.5">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
