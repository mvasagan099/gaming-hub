import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { apiClient } from '../../services/api/client';
import { adminApi } from '../../services/api/enterprise';
import type { AdminCustomerDetail } from '@gaming-hub/shared';

interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [walletAmount, setWalletAmount] = useState(0);
  const [walletReason, setWalletReason] = useState('');
  const [newRole, setNewRole] = useState<'USER' | 'MODERATOR' | 'ADMIN'>('USER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
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
    loadUsers();
  }, []);

  const userIdParam = searchParams.get('userId');

  useEffect(() => {
    if (!userIdParam) return;
    setSearchParams({}, { replace: true });
    void openDetail(userIdParam);
  }, [userIdParam, setSearchParams, openDetail]);

  const handleWalletAdjust = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.post(`/admin/users/${selectedUser.id}/wallet`, { amount: walletAmount, reason: walletReason });
      await loadUsers();
      setShowWalletModal(false);
      setSuccessMessage(`Wallet adjusted for ${selectedUser.displayName}`);
      setTimeout(() => setSuccessMessage(null), 3000);
      setWalletAmount(0);
      setWalletReason('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to adjust wallet';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.patch(`/admin/users/${selectedUser.id}/role`, { role: newRole });
      await loadUsers();
      setShowRoleModal(false);
      setSuccessMessage(`Role changed to ${newRole} for ${selectedUser.displayName}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change role';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error && !selectedUser) {
    return (
      <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-600">
        <p className="font-medium">Failed to load users</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Users</h1>

      {successMessage && (
        <div className="mb-4 rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600">
          {successMessage}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr className="text-left text-sm text-muted-foreground">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Coins</th>
              <th className="px-4 py-3">Level</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users?.items.map((user) => (
              <tr key={user.id} className="border-b border-border">
                <td className="px-4 py-3">
                  <div>
                    <div className="font-medium">{user.displayName}</div>
                    <div className="text-sm text-muted-foreground">@{user.username}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      user.role === 'ADMIN'
                        ? 'bg-red-500/10 text-red-600'
                        : user.role === 'MODERATOR'
                          ? 'bg-blue-500/10 text-blue-600'
                          : 'bg-gray-500/10 text-gray-600'
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3">{user.coins}</td>
                <td className="px-4 py-3">{user.level}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      user.isOnline ? 'bg-green-500/10 text-green-600' : 'bg-gray-500/10 text-gray-600'
                    }`}
                  >
                    {user.isOnline ? 'Online' : 'Offline'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => void openDetail(user.id)}
                      className="rounded bg-emerald-500 px-2 py-1 text-xs text-white hover:bg-emerald-600"
                    >
                      360 View
                    </button>
                    <button
                      onClick={() => {
                        setSelectedUser(user);
                        setShowWalletModal(true);
                      }}
                      className="rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600"
                    >
                      Adjust Wallet
                    </button>
                    <button
                      onClick={() => {
                        setSelectedUser(user);
                        setNewRole(user.role);
                        setShowRoleModal(true);
                      }}
                      className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      Change Role
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users && (
          <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
            Total: {users.total} users
          </div>
        )}
      </div>

      {showWalletModal && selectedUser && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50">
          <div className="w-[400px] rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Adjust Wallet</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Adjusting wallet for: {selectedUser.displayName} (Current: {selectedUser.coins})
            </p>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium">Amount (positive to add, negative to remove)</label>
              <input
                type="number"
                value={walletAmount}
                onChange={(e) => setWalletAmount(e.target.valueAsNumber)}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </div>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium">Reason</label>
              <input
                type="text"
                value={walletReason}
                onChange={(e) => setWalletReason(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
                placeholder="Reason for adjustment"
              />
            </div>
            {error && (
              <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 p-2 text-sm text-red-600">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowWalletModal(false);
                  setError(null);
                  setWalletAmount(0);
                  setWalletReason('');
                }}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleWalletAdjust}
                disabled={isSubmitting || !walletReason || walletAmount === 0}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? 'Adjusting...' : 'Adjust'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRoleModal && selectedUser && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50">
          <div className="w-[400px] rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Change Role</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Changing role for: {selectedUser.displayName} (Current: {selectedUser.role})
            </p>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium">New Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as 'USER' | 'MODERATOR' | 'ADMIN')}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              >
                <option value="USER">User</option>
                <option value="MODERATOR">Moderator</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            {error && (
              <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 p-2 text-sm text-red-600">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowRoleModal(false);
                  setError(null);
                }}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleRoleChange}
                disabled={isSubmitting || newRole === selectedUser.role}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? 'Changing...' : 'Change Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setDetail(null)}>
          <div
            className="fixed right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">{detail.user.displayName}</h2>
                <p className="text-sm text-muted-foreground">
                  @{detail.user.username} · {detail.user.email ?? 'no email'} · {detail.user.role}
                </p>
                <p className="text-xs text-muted-foreground">
                  Joined {new Date(detail.user.createdAt).toLocaleDateString()} ·{' '}
                  {detail.user.isOnline ? 'Online' : `Last seen ${detail.user.lastSeenAt ? new Date(detail.user.lastSeenAt).toLocaleDateString() : 'never'}`}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="rounded-md border border-border p-1.5 hover:bg-muted" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            {detailLoading ? (
              <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="mt-6 space-y-6">
                {detail.profile && (
                  <StatGrid
                    items={[
                      { label: 'Level', value: String(detail.profile.level) },
                      { label: 'XP', value: detail.profile.xp.toLocaleString() },
                      { label: 'W / L / D', value: `${detail.profile.wins} / ${detail.profile.losses} / ${detail.profile.draws}` },
                      { label: 'Country', value: detail.profile.country ?? '—' },
                    ]}
                  />
                )}

                {detail.wallet && (
                  <Section title="Wallet">
                    <StatGrid
                      items={[
                        { label: 'Main', value: detail.wallet.balance.toLocaleString() },
                        { label: 'Bonus', value: detail.wallet.bonusBalance.toLocaleString() },
                        { label: 'Locked', value: detail.wallet.lockedBalance.toLocaleString() },
                        { label: 'Reward', value: detail.wallet.rewardBalance.toLocaleString() },
                        { label: 'Cashback', value: detail.wallet.cashbackBalance.toLocaleString() },
                      ]}
                    />
                  </Section>
                )}

                {detail.statistics.length > 0 && (
                  <Section title={`Game stats (${detail.statistics.length})`}>
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

                {detail.tickets.length > 0 && (
                  <Section title={`Support tickets (${detail.tickets.length})`}>
                    <Table
                      headers={['Subject', 'Status', 'Priority']}
                      rows={detail.tickets.map((t) => [t.subject, t.status, t.priority])}
                    />
                  </Section>
                )}

                {detail.referrals.length > 0 && (
                  <Section title={`Referrals (${detail.referrals.length})`}>
                    <Table
                      headers={['Referral', 'Status', 'Commission']}
                      rows={detail.referrals.map((r) => [
                        r.referredUser.username ?? '—',
                        r.status,
                        r.commission.toLocaleString(),
                      ])}
                    />
                  </Section>
                )}

                {detail.matches.length > 0 && (
                  <Section title={`Recent matches (${detail.matches.length})`}>
                    <Table
                      headers={['Game', 'Result', 'Stake', 'Date']}
                      rows={detail.matches.map((m) => [
                        m.gameId,
                        m.result,
                        m.stake.toLocaleString(),
                        new Date(m.createdAt).toLocaleDateString(),
                      ])}
                    />
                  </Section>
                )}

                {detail.achievements.length > 0 && (
                  <Section title={`Achievements (${detail.achievements.length})`}>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.achievements.map((a) => (
                        <span key={a.code} className="rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                          {a.icon} {a.title}
                        </span>
                      ))}
                    </div>
                  </Section>
                )}

                {detail.sessions.length > 0 && (
                  <Section title={`Active sessions (${detail.sessions.length})`}>
                    <Table
                      headers={['Device', 'IP', 'Created']}
                      rows={detail.sessions.map((s) => [
                        `${s.deviceName ?? 'Unknown'}${s.isCurrent ? ' (current)' : ''}`,
                        s.ip ?? '—',
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
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function StatGrid({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-border bg-card p-3">
          <p className="text-[11px] font-medium text-muted-foreground">{item.label}</p>
          <p className="mt-0.5 text-sm font-bold">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full">
        <thead className="border-b border-border bg-muted/50">
          <tr className="text-left text-xs text-muted-foreground">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-sm">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
