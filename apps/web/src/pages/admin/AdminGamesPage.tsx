import { useEffect, useState, useMemo } from 'react';
import {
  Gamepad2,
  Settings2,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Coins,
  Users,
  Trophy,
  History,
  AlertTriangle,
  RefreshCw,
  Sliders,
  ShieldCheck,
  Zap,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../services/api/client';
import {
  GAME_DEFINITIONS,
  type GameConfig,
  type GameId,
  type PrizeMode,
  type DrawPolicy,
  PRIZE_MODES,
  DRAW_POLICIES,
} from '@gaming-hub/shared';

interface AdminGameConfigRow extends GameConfig {
  activeMatchesCount: number;
}

interface ConfigAuditLog {
  id: string;
  action: string;
  gameId: string;
  adminUsername: string;
  adminDisplayName: string;
  meta: Record<string, any>;
  createdAt: string;
}

const defMap = new Map(GAME_DEFINITIONS.map((g) => [g.id, g]));

export function AdminGamesPage() {
  const [games, setGames] = useState<AdminGameConfigRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<ConfigAuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<'games' | 'audit'>('games');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Modal / Drawer state for configuring a game
  const [editingGame, setEditingGame] = useState<AdminGameConfigRow | null>(null);
  const [formData, setFormData] = useState<Partial<GameConfig>>({});
  const [newFeeInput, setNewFeeInput] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchGames = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<AdminGameConfigRow[]>('/admin/games');
      setGames(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load games configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await apiClient.get<{ items: ConfigAuditLog[] }>('/admin/games/audit-logs?pageSize=30');
      setAuditLogs(res.items);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load audit logs');
    }
  };

  useEffect(() => {
    void fetchGames();
    void fetchAuditLogs();
  }, []);

  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      const def = defMap.get(g.gameId as GameId);
      const matchesSearch =
        g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.gameId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === 'ALL' || def?.category.toUpperCase() === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [games, searchQuery, selectedCategory]);

  const handleToggleEnable = async (game: AdminGameConfigRow, e: React.MouseEvent) => {
    e.stopPropagation();
    const endpoint = game.enabled ? `/admin/games/${game.gameId}/disable` : `/admin/games/${game.gameId}/enable`;
    try {
      await apiClient.post(endpoint);
      toast.success(`${game.name} ${game.enabled ? 'disabled' : 'enabled'}`);
      await fetchGames();
      await fetchAuditLogs();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update game status');
    }
  };

  const handleToggleOnline = async (game: AdminGameConfigRow, e: React.MouseEvent) => {
    e.stopPropagation();
    const endpoint = game.onlineEnabled
      ? `/admin/games/${game.gameId}/online/disable`
      : `/admin/games/${game.gameId}/online/enable`;
    try {
      await apiClient.post(endpoint);
      toast.success(`${game.name} online mode ${game.onlineEnabled ? 'disabled' : 'enabled'}`);
      await fetchGames();
      await fetchAuditLogs();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update online mode');
    }
  };

  const openConfigModal = (game: AdminGameConfigRow) => {
    setEditingGame(game);
    setFormData({
      name: game.name,
      enabled: game.enabled,
      onlineEnabled: game.onlineEnabled,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
      entryFees: [...game.entryFees],
      defaultEntryFee: game.defaultEntryFee,
      turnTimerSeconds: game.turnTimerSeconds,
      reconnectWindowSeconds: game.reconnectWindowSeconds,
      matchDurationSeconds: game.matchDurationSeconds,
      prizeMode: game.prizeMode,
      winnerPercentage: game.winnerPercentage,
      fixedPrizeAmount: game.fixedPrizeAmount,
      drawPolicy: game.drawPolicy,
      maxConcurrentMatches: game.maxConcurrentMatches,
      gameSpecificSettings: game.gameSpecificSettings ? { ...game.gameSpecificSettings } : {},
    });
    setNewFeeInput('');
  };

  const handleAddEntryFee = () => {
    const fee = parseInt(newFeeInput.trim(), 10);
    if (isNaN(fee) || fee <= 0) {
      toast.error('Enter a valid positive number');
      return;
    }
    const currentFees = formData.entryFees ?? [];
    if (currentFees.includes(fee)) {
      toast.error('Fee already exists');
      return;
    }
    const updated = [...currentFees, fee].sort((a, b) => a - b);
    setFormData({
      ...formData,
      entryFees: updated,
      defaultEntryFee: formData.defaultEntryFee ?? updated[0],
    });
    setNewFeeInput('');
  };

  const handleRemoveEntryFee = (fee: number) => {
    const currentFees = formData.entryFees ?? [];
    if (currentFees.length <= 1) {
      toast.error('Game must have at least one entry fee');
      return;
    }
    const updated = currentFees.filter((f) => f !== fee);
    let newDefault = formData.defaultEntryFee;
    if (newDefault === fee || !updated.includes(newDefault!)) {
      newDefault = updated[0];
    }
    setFormData({
      ...formData,
      entryFees: updated,
      defaultEntryFee: newDefault,
    });
  };

  const handleSaveConfig = async () => {
    if (!editingGame) return;

    // Validate
    if (!formData.name?.trim()) {
      toast.error('Game name cannot be empty');
      return;
    }
    if (!formData.entryFees || formData.entryFees.length === 0) {
      toast.error('At least one entry fee is required');
      return;
    }
    if (formData.defaultEntryFee && !formData.entryFees.includes(formData.defaultEntryFee)) {
      toast.error('Default entry fee must be in the configured entry fees list');
      return;
    }
    if ((formData.minPlayers ?? 2) > (formData.maxPlayers ?? 2)) {
      toast.error('maxPlayers cannot be less than minPlayers');
      return;
    }

    setIsSaving(true);
    try {
      await apiClient.post(`/admin/games/${editingGame.gameId}/config`, formData);
      toast.success(`${formData.name} configuration updated successfully!`);
      setEditingGame(null);
      await fetchGames();
      await fetchAuditLogs();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update configuration');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shadow-inner">
              <Gamepad2 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                Games Management
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Centralized System
                </span>
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Manage global availability, allowed entry fees, turn timers, prize modes, and rule snapshots.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60">
            <button
              onClick={() => setActiveTab('games')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'games'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Games ({games.length})
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'audit'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Audit Trail
            </button>
          </div>

          <button
            onClick={() => {
              void fetchGames();
              void fetchAuditLogs();
            }}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {activeTab === 'games' ? (
        <>
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search game by name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              {['ALL', 'BOARD', 'ARCADE', 'SPORTS'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    selectedCategory === cat
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/20'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Games Table Card */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 backdrop-blur-md overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Game</th>
                    <th className="px-4 py-4">Global Status</th>
                    <th className="px-4 py-4">Online Mode</th>
                    <th className="px-4 py-4">Allowed Entry Fees</th>
                    <th className="px-4 py-4">Turn Timer</th>
                    <th className="px-4 py-4">Prize Mode</th>
                    <th className="px-4 py-4">Active Matches</th>
                    <th className="px-4 py-4">Version</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                        Loading game configurations...
                      </td>
                    </tr>
                  ) : filteredGames.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                        No games found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredGames.map((game) => {
                      const def = defMap.get(game.gameId as GameId);
                      return (
                        <tr
                          key={game.gameId}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          {/* Game */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl shadow-sm">
                                {def?.icon ?? '🎮'}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  {game.name}
                                </p>
                                <p className="text-xs text-slate-400 font-mono">ID: {game.gameId}</p>
                              </div>
                            </div>
                          </td>

                          {/* Enabled / Disabled Toggle */}
                          <td className="px-4 py-4">
                            <button
                              onClick={(e) => handleToggleEnable(game, e)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                                game.enabled
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                              }`}
                            >
                              {game.enabled ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Enabled
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-3.5 h-3.5" />
                                  Disabled
                                </>
                              )}
                            </button>
                          </td>

                          {/* Online Mode Toggle */}
                          <td className="px-4 py-4">
                            <button
                              onClick={(e) => handleToggleOnline(game, e)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                                game.onlineEnabled
                                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                              }`}
                            >
                              <Zap className="w-3.5 h-3.5" />
                              {game.onlineEnabled ? 'Online PVP' : 'Offline Solo'}
                            </button>
                          </td>

                          {/* Allowed Entry Fees */}
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-1 items-center">
                              {game.entryFees.map((fee) => (
                                <span
                                  key={fee}
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                    fee === game.defaultEntryFee
                                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 font-extrabold'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                  }`}
                                >
                                  🪙 {fee}
                                </span>
                              ))}
                            </div>
                          </td>

                          {/* Turn Timer */}
                          <td className="px-4 py-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {game.turnTimerSeconds > 0 ? `${game.turnTimerSeconds}s` : 'Realtime'}
                            </div>
                          </td>

                          {/* Prize Mode */}
                          <td className="px-4 py-4">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {game.prizeMode === 'WINNER_PERCENTAGE'
                                ? `${game.winnerPercentage}% Winner`
                                : game.prizeMode.replace(/_/g, ' ')}
                            </span>
                          </td>

                          {/* Active Matches */}
                          <td className="px-4 py-4">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                              <Users className="w-3 h-3" />
                              {game.activeMatchesCount}
                            </span>
                          </td>

                          {/* Version */}
                          <td className="px-4 py-4 text-xs font-mono text-slate-400">
                            v{game.configVersion}
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => openConfigModal(game)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-500/20 transition-all flex items-center gap-1.5 ml-auto"
                            >
                              <Settings2 className="w-3.5 h-3.5" />
                              Configure
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Audit Logs View */
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 backdrop-blur-md overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-500" />
              Game Configuration Audit Logs
            </h3>
            <span className="text-xs text-slate-400">Recorded system & admin rule updates</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Timestamp</th>
                  <th className="px-4 py-3.5">Action</th>
                  <th className="px-4 py-3.5">Target Game</th>
                  <th className="px-4 py-3.5">Admin</th>
                  <th className="px-6 py-3.5">Version & Changes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-xs">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-sans">
                      No audit records found yet.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-6 py-3 text-slate-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">
                        {log.gameId}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {log.adminDisplayName || log.adminUsername}
                      </td>
                      <td className="px-6 py-3 text-slate-500 dark:text-slate-400 truncate max-w-xs">
                        v{log.meta?.configVersion ?? '?'} - {JSON.stringify(log.meta?.newConfig?.entryFees ?? '')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Game Configuration Modal */}
      {editingGame && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-lg font-bold">
                  {defMap.get(editingGame.gameId as GameId)?.icon ?? '🎮'}
                </div>
                <div>
                  <h3 className="font-black text-slate-900 dark:text-white text-lg">
                    Configure {formData.name || editingGame.name}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Current: v{editingGame.configVersion} → Next: v{editingGame.configVersion + 1}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingGame(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Toggles */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="font-bold text-sm text-slate-900 dark:text-white">Game Enabled</p>
                    <p className="text-xs text-slate-400">Controls match creation</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.enabled ?? true}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="size-5 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="font-bold text-sm text-slate-900 dark:text-white">Online Mode</p>
                    <p className="text-xs text-slate-400">Matchmaking & rooms</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.onlineEnabled ?? true}
                    onChange={(e) => setFormData({ ...formData, onlineEnabled: e.target.checked })}
                    className="size-5 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
                  />
                </label>
              </div>

              {/* Entry Fees Tag Manager */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-amber-500" />
                    Allowed Entry Fees (Coins)
                  </label>
                  <span className="text-xs text-slate-400">Players can only wager configured amounts</span>
                </div>

                <div className="flex flex-wrap gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 min-h-[50px] items-center">
                  {formData.entryFees?.map((fee) => (
                    <span
                      key={fee}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-extrabold bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    >
                      🪙 {fee}
                      {fee === formData.defaultEntryFee && (
                        <span className="text-[10px] bg-amber-500 text-black px-1.5 py-0.2 rounded font-bold">
                          DEFAULT
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveEntryFee(fee)}
                        className="text-amber-300 hover:text-rose-400 ml-1"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Add fee (e.g. 250)..."
                    value={newFeeInput}
                    onChange={(e) => setNewFeeInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddEntryFee()}
                    className="flex-1 px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddEntryFee}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Add Fee
                  </button>
                </div>
              </div>

              {/* Default Fee & Player Counts */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Default Entry Fee
                  </label>
                  <select
                    value={formData.defaultEntryFee}
                    onChange={(e) => setFormData({ ...formData, defaultEntryFee: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none font-bold"
                  >
                    {formData.entryFees?.map((fee) => (
                      <option key={fee} value={fee}>
                        🪙 {fee} Coins
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Min Players
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formData.minPlayers ?? 2}
                    onChange={(e) => setFormData({ ...formData, minPlayers: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Max Players
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formData.maxPlayers ?? 2}
                    onChange={(e) => setFormData({ ...formData, maxPlayers: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none"
                  />
                </div>
              </div>

              {/* Timers */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Turn Timer (s)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.turnTimerSeconds ?? 30}
                    onChange={(e) => setFormData({ ...formData, turnTimerSeconds: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Match Duration (s)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.matchDurationSeconds ?? 300}
                    onChange={(e) => setFormData({ ...formData, matchDurationSeconds: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Reconnect Grace (s)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={formData.reconnectWindowSeconds ?? 30}
                    onChange={(e) => setFormData({ ...formData, reconnectWindowSeconds: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none"
                  />
                </div>
              </div>

              {/* Prize & Draw Configuration */}
              <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 space-y-4">
                <h4 className="font-bold text-sm text-indigo-400 flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
                  Prize Settlement & Draw Policy
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Prize Mode
                    </label>
                    <select
                      value={formData.prizeMode}
                      onChange={(e) => setFormData({ ...formData, prizeMode: e.target.value as PrizeMode })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm outline-none font-bold"
                    >
                      {PRIZE_MODES.map((pm) => (
                        <option key={pm} value={pm}>
                          {pm}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Winner Percentage (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={formData.winnerPercentage ?? 90}
                      onChange={(e) => setFormData({ ...formData, winnerPercentage: parseInt(e.target.value, 10) })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm outline-none font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Draw Policy
                  </label>
                  <select
                    value={formData.drawPolicy}
                    onChange={(e) => setFormData({ ...formData, drawPolicy: e.target.value as DrawPolicy })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm outline-none font-bold"
                  >
                    {DRAW_POLICIES.map((dp) => (
                      <option key={dp} value={dp}>
                        {dp}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">
                Saves automatically increment config version to v{editingGame.configVersion + 1}
              </span>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingGame(null)}
                  className="px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={isSaving}
                  className="px-6 py-2 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Save Configuration
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
