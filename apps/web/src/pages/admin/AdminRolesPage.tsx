import { useEffect, useState } from 'react';
import {
  Shield,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  Lock,
  Users,
  ShieldAlert,
  UserPlus,
  UserMinus,
  Search,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../services/api/client';
import { adminApi, type CustomRoleView } from '../../services/api/enterprise';
import { ALL_PERMISSIONS, type Permission } from '@gaming-hub/shared';

const PERMISSION_GROUPS: Record<string, { label: string; permissions: Permission[] }> = {
  users: {
    label: 'User Management',
    permissions: ['admin:users:view', 'admin:users:manage', 'admin:referrals:view'],
  },
  wallet: {
    label: 'Wallet & Finances',
    permissions: ['admin:wallet:view', 'admin:wallet:adjust', 'admin:wallet:requests:view', 'admin:wallet:requests:manage'],
  },
  gameplay: {
    label: 'Matches & Gaming',
    permissions: ['admin:matches:view', 'admin:rooms:view', 'admin:tournaments:view', 'admin:tournaments:manage'],
  },
  marketing: {
    label: 'Marketing & Support',
    permissions: [
      'admin:coupons:view',
      'admin:coupons:manage',
      'admin:announcements:view',
      'admin:announcements:manage',
      'admin:crm:view',
      'admin:crm:manage',
    ],
  },
  compliance: {
    label: 'KYC & Compliance',
    permissions: ['admin:kyc:view', 'admin:kyc:review', 'admin:kyc:override', 'admin:kyc:config'],
  },
  system: {
    label: 'System & Security',
    permissions: [
      'admin:settings:view',
      'admin:settings:edit',
      'admin:audit:view',
      'admin:monitoring:view',
      'admin:analytics:view',
      'admin:errors:view',
      'admin:errors:manage',
      'admin:features:view',
      'admin:features:edit',
      'admin:automation:view',
      'admin:automation:manage',
      'admin:roles:view',
      'admin:roles:create',
      'admin:roles:edit',
      'admin:roles:delete',
    ],
  },
};

export function AdminRolesPage() {
  const [roles, setRoles] = useState<CustomRoleView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRoleView | null>(null);

  // Members Modal State
  const [selectedRoleForMembers, setSelectedRoleForMembers] = useState<CustomRoleView | null>(null);
  const [roleMembers, setRoleMembers] = useState<
    Array<{ id: string; username: string; displayName: string; email: string | null; isOnline: boolean; createdAt: string }>
  >([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [candidateUsers, setCandidateUsers] = useState<
    Array<{ id: string; username: string; displayName: string; email: string | null }>
  >([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  // Form State
  const [roleName, setRoleName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadRoles = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.roles();
      setRoles(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load roles');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRoles();
  }, []);

  const handleOpenCreate = () => {
    setRoleName('');
    setDisplayName('');
    setDescription('');
    setSelectedPermissions([]);
    setError(null);
    setShowCreateModal(true);
  };

  const handleOpenEdit = (role: CustomRoleView) => {
    setEditingRole(role);
    setDisplayName(role.displayName);
    setDescription(role.description || '');
    setSelectedPermissions((role.permissions as Permission[]) || []);
    setError(null);
  };

  const togglePermission = (perm: Permission) => {
    setSelectedPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const toggleGroup = (groupKey: string) => {
    const groupPerms = PERMISSION_GROUPS[groupKey].permissions;
    const allSelected = groupPerms.every((p) => selectedPermissions.includes(p));
    if (allSelected) {
      setSelectedPermissions((prev) => prev.filter((p) => !groupPerms.includes(p)));
    } else {
      setSelectedPermissions((prev) => Array.from(new Set([...prev, ...groupPerms])));
    }
  };

  const handleCreateRole = async () => {
    if (!roleName || !displayName) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await adminApi.createRole({
        name: roleName.toLowerCase().replace(/\s+/g, '_'),
        displayName,
        description,
        permissions: selectedPermissions,
      });
      setShowCreateModal(false);
      await loadRoles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create role');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!editingRole) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await adminApi.updateRole(editingRole.id, {
        displayName,
        description,
        permissions: selectedPermissions,
      });
      setEditingRole(null);
      await loadRoles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRole = async (id: string) => {
    if (!confirm('Are you sure you want to delete this custom role? Users assigned to this role will lose their custom permissions.')) return;
    try {
      await adminApi.deleteRole(id);
      await loadRoles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete role');
    }
  };

  const openMembersModal = async (role: CustomRoleView) => {
    setSelectedRoleForMembers(role);
    setMembersLoading(true);
    setMemberSearchQuery('');
    setCandidateUsers([]);
    try {
      const res = await adminApi.roleUsers(role.id);
      setRoleMembers(res.users || []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load assigned users');
    } finally {
      setMembersLoading(false);
    }
  };

  const handleAssignUserToRole = async (userId: string) => {
    if (!selectedRoleForMembers) return;
    setActionUserId(userId);
    try {
      await adminApi.assignRoleUser(selectedRoleForMembers.id, userId);
      toast.success(`User assigned to ${selectedRoleForMembers.displayName}`);
      const res = await adminApi.roleUsers(selectedRoleForMembers.id);
      setRoleMembers(res.users || []);
      setMemberSearchQuery('');
      setCandidateUsers([]);
      void loadRoles();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to assign role');
    } finally {
      setActionUserId(null);
    }
  };

  const handleRemoveUserFromRole = async (userId: string) => {
    if (!selectedRoleForMembers) return;
    setActionUserId(userId);
    try {
      await adminApi.removeRoleUser(selectedRoleForMembers.id, userId);
      toast.success(`User removed from ${selectedRoleForMembers.displayName}`);
      const res = await adminApi.roleUsers(selectedRoleForMembers.id);
      setRoleMembers(res.users || []);
      void loadRoles();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove user from role');
    } finally {
      setActionUserId(null);
    }
  };

  const searchUsersForRole = async (query: string) => {
    setMemberSearchQuery(query);
    if (!query.trim() || query.trim().length < 2) {
      setCandidateUsers([]);
      return;
    }
    setCandidateLoading(true);
    try {
      const res = await apiClient.get<{ items: Array<{ id: string; username: string; displayName: string; email: string | null }> }>(
        '/admin/users?pageSize=20',
      );
      const q = query.toLowerCase();
      const filtered = (res.items || []).filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q),
      );
      setCandidateUsers(filtered);
    } catch {
      // non-fatal
    } finally {
      setCandidateLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 md:p-8 rounded-[2rem] bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white shadow-xl shadow-indigo-950/20 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold mb-3">
              <Shield className="w-3.5 h-3.5 text-indigo-400" /> RBAC Security Suite
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Custom Roles & Permissions</h1>
            <p className="text-sm font-normal text-indigo-200 mt-1 max-w-xl">
              Create custom administrative roles with fine-grained access controls. Assign permissions tailored for support agents, tournament managers, or finance auditors.
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="px-5 py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-400 text-white font-black text-xs shadow-lg shadow-indigo-500/30 flex items-center gap-2 transition-transform active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Custom Role</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs font-bold flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Roles Cards Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-xs font-bold text-slate-400">Loading custom roles...</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <div
              key={role.id || role.name}
              className="p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 shadow-sm flex flex-col justify-between space-y-4 hover:border-indigo-500/30 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-black">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-slate-900 dark:text-white">{role.displayName}</h2>
                      <code className="text-[10px] font-mono text-slate-400">@{role.name}</code>
                    </div>
                  </div>
                  {role.isSystem ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase border border-slate-200 dark:border-slate-700">
                      System
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/10 text-indigo-500 uppercase border border-indigo-500/20">
                      Custom
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 line-clamp-2">
                  {role.description || 'No description provided.'}
                </p>
              </div>

              <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-400">Assigned Users</span>
                  <button
                    onClick={() => void openMembersModal(role)}
                    className="font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1 transition-colors"
                    title="Click to view and manage assigned users"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>{role.userCount ?? 0} {role.userCount === 1 ? 'user' : 'users'}</span>
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-400">Permissions</span>
                  <span className="font-extrabold text-indigo-500">
                    {role.permissions.length} Enabled
                  </span>
                </div>

                {!role.isSystem && (
                  <div className="space-y-2 pt-2">
                    <button
                      onClick={() => void openMembersModal(role)}
                      className="w-full py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-indigo-500/20"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Manage Assigned Users</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEdit(role)}
                        className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit Role</span>
                      </button>
                      <button
                        onClick={() => void handleDeleteRole(role.id)}
                        className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-bold transition-colors"
                        title="Delete Custom Role"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Role Modal */}
      {(showCreateModal || editingRole) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl my-8 rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-2xl space-y-6 text-slate-900 dark:text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-xl font-black">
                  {editingRole ? `Edit Role: ${editingRole.displayName}` : 'Create Custom Role'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure granular permissions for administrative access control.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingRole(null);
                }}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
              >
                ✕
              </button>
            </div>

            {/* Inputs */}
            <div className="space-y-4">
              {!editingRole && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Role System Key (e.g. support_agent, tournament_mod)
                  </label>
                  <input
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder="support_agent"
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-xs outline-none"
                  />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Display Name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Support Specialist"
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-xs outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Can handle tickets, view user detail, and issue refunds."
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-xs outline-none"
                />
              </div>
            </div>

            {/* Permissions Checkboxes */}
            <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                Grant Fine-Grained Permissions
              </h3>

              <div className="space-y-4">
                {Object.entries(PERMISSION_GROUPS).map(([key, group]) => {
                  const allSelected = group.permissions.every((p) => selectedPermissions.includes(p));
                  return (
                    <div key={key} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-900 dark:text-white">{group.label}</span>
                        <button
                          type="button"
                          onClick={() => toggleGroup(key)}
                          className="text-[10px] font-extrabold text-indigo-500 hover:underline"
                        >
                          {allSelected ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {group.permissions.map((perm) => {
                          const isChecked = selectedPermissions.includes(perm);
                          return (
                            <label
                              key={perm}
                              className={`flex items-center gap-2 p-2 rounded-xl border transition-colors cursor-pointer text-xs ${
                                isChecked
                                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-bold'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => togglePermission(perm)}
                                className="rounded text-indigo-600 focus:ring-0"
                              />
                              <span className="font-mono text-[11px]">{perm}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingRole(null);
                }}
                className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={editingRole ? handleUpdateRole : handleCreateRole}
                disabled={isSubmitting || (!editingRole && !roleName)}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-lg shadow-indigo-600/30 disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : editingRole ? 'Save Role Changes' : 'Create Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Role Members Modal */}
      {selectedRoleForMembers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-xl my-8 rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-2xl space-y-6 text-slate-900 dark:text-white max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-black shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black flex items-center gap-2">
                    <span>Assigned Users</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 font-extrabold border border-indigo-500/20">
                      {selectedRoleForMembers.displayName}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Assign or remove users for the <code className="font-mono text-indigo-400">@{selectedRoleForMembers.name}</code> custom role.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRoleForMembers(null)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Assign Search Input */}
            <div className="space-y-2 shrink-0">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-indigo-500" />
                <span>Assign User to this Role</span>
              </label>
              <div className="flex items-center w-full rounded-2xl bg-slate-50 dark:bg-slate-800 px-4 py-2.5 border border-slate-200 dark:border-slate-700">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  value={memberSearchQuery}
                  onChange={(e) => void searchUsersForRole(e.target.value)}
                  placeholder="Type username, display name, or email to find user..."
                  className="ml-3 w-full bg-transparent outline-none text-xs text-slate-900 dark:text-white placeholder-slate-400"
                />
                {candidateLoading && <Loader2 className="w-4 h-4 animate-spin text-indigo-500 shrink-0" />}
              </div>

              {/* Search Candidates Dropdown / List */}
              {candidateUsers.length > 0 && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/70 p-2 space-y-1.5 max-h-48 overflow-y-auto">
                  {candidateUsers.map((u) => {
                    const isAlreadyMember = roleMembers.some((m) => m.id === u.id);
                    return (
                      <div
                        key={u.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 text-xs"
                      >
                        <div className="truncate mr-2">
                          <span className="font-bold text-slate-900 dark:text-white">{u.displayName}</span>
                          <span className="text-slate-400 ml-1.5 text-[11px]">@{u.username}</span>
                          {u.email && <span className="text-slate-400 ml-1 text-[11px]">({u.email})</span>}
                        </div>
                        {isAlreadyMember ? (
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
                            Already Assigned
                          </span>
                        ) : (
                          <button
                            onClick={() => void handleAssignUserToRole(u.id)}
                            disabled={actionUserId === u.id}
                            className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shrink-0 flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {actionUserId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                            <span>Assign</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Current Role Members */}
            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                <span>Currently Assigned Users ({roleMembers.length})</span>
              </div>

              {membersLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                </div>
              ) : roleMembers.length === 0 ? (
                <div className="text-center py-10 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 space-y-2">
                  <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                  <p className="text-xs font-bold text-slate-500">No users assigned to this role yet.</p>
                  <p className="text-[11px] text-slate-400">Use the search box above or go to the User Directory to assign users.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {roleMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60"
                    >
                      <div className="flex items-center gap-3 truncate mr-2">
                        <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold text-xs shrink-0">
                          {member.displayName.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {member.displayName}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                            <span>@{member.username}</span>
                            {member.email && <span>· {member.email}</span>}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => void handleRemoveUserFromRole(member.id)}
                        disabled={actionUserId === member.id}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-bold transition-colors flex items-center gap-1 shrink-0 disabled:opacity-50"
                        title="Remove role from this user"
                      >
                        {actionUserId === member.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UserMinus className="w-3.5 h-3.5" />
                        )}
                        <span>Unassign</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <a
                href="/admin/users"
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Go to User Directory →
              </a>
              <button
                onClick={() => setSelectedRoleForMembers(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors"
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
