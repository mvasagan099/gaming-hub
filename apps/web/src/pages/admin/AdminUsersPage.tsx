import { useEffect, useState } from 'react';
import { apiClient } from '../../services/api/client';

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
    </div>
  );
}
