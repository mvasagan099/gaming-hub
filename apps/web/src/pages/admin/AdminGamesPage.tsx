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
  TIMEOUT_RESOLUTIONS,
  type TimeoutResolution,
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
  const [activeTab, setActiveTab] = useState<'games' | 'timeouts' | 'global' | 'audit'>('games');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Modal / Drawer state for configuring a game
  const [editingGame, setEditingGame] = useState<AdminGameConfigRow | null>(null);
  const [formData, setFormData] = useState<Partial<GameConfig>>({});
  const [newFeeInput, setNewFeeInput] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const [matchSettings, setMatchSettings] = useState<{
    maxMatchDurationSeconds: number;
    warningTimesSeconds: number[];
    defaultTurnTimeoutSeconds: number;
    version: number;
  }>({
    maxMatchDurationSeconds: 600,
    warningTimesSeconds: [300, 120, 60, 30, 10],
    defaultTurnTimeoutSeconds: 30,
    version: 1,
  });
  const [isSavingMatchSettings, setIsSavingMatchSettings] = useState(false);

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

  const fetchMatchSettings = async () => {
    try {
      const res = await apiClient.get<{ ok: true; settings: typeof matchSettings }>('/admin/match-settings');
      if (res.settings) {
        setMatchSettings(res.settings);
      }
    } catch {
      // Fallback
    }
  };

  const handleSaveMatchSettings = async () => {
    setIsSavingMatchSettings(true);
    try {
      await apiClient.patch('/admin/match-settings', matchSettings);
      toast.success('Global match settings updated successfully!');
      await fetchMatchSettings();
      await fetchAuditLogs();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update match settings');
    } finally {
      setIsSavingMatchSettings(false);
    }
  };

  useEffect(() => {
    void fetchGames();
    void fetchAuditLogs();
    void fetchMatchSettings();
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
      matchDurationSeconds: game.matchDurationSeconds ?? 600,
      timeoutResolution: game.timeoutResolution ?? "GAME_SPECIFIC",
      allowDraw: game.allowDraw !== false,
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
              onClick={() => setActiveTab('timeouts')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'timeouts'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Game Settings
            </button>
            <button
              onClick={() => setActiveTab('global')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'global'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Match Settings
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
              void fetchMatchSettings();
            }}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* TAB 1: ALL GAMES OVERVIEW */}
      {activeTab === 'games' && (
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
                                  : 'bg-slate-500/10 text-slate-500 border border-slate-500/20 hover:bg-slate-500/20'
                              }`}
                            >
                              <Zap className="w-3.5 h-3.5" />
                              {game.onlineEnabled ? 'Online Active' : 'Offline Only'}
                            </button>
                          </td>

                          {/* Entry Fees Tag Preview */}
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {game.entryFees.slice(0, 4).map((fee) => (
                                <span
                                  key={fee}
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ${
                                    fee === game.defaultEntryFee
                                      ? 'bg-amber-500 text-slate-950 font-black'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  <Coins className={`w-3 h-3 ${fee === game.defaultEntryFee ? 'text-black' : 'text-amber-400'}`} /> {fee}
                                </span>
                              ))}
                              {game.entryFees.length > 4 && (
                                <span className="text-[10px] text-slate-400 self-center">
                                  +{game.entryFees.length - 4} more
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Turn Timer */}
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-1.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {game.turnTimerSeconds > 0 ? `${game.turnTimerSeconds}s` : 'Real-time'}
                            </div>
                          </td>

                          {/* Prize Mode */}
                          <td className="px-4 py-4">
                            <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {game.prizeMode === 'WINNER_PERCENTAGE'
                                ? `${game.winnerPercentage}% Pot`
                                : game.prizeMode.replace(/_/g, ' ')}
                            </span>
                          </td>

                          {/* Active Matches */}
                          <td className="px-4 py-4">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 font-mono text-xs font-bold">
                              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              {game.activeMatchesCount} active
                            </span>
                          </td>

                          {/* Config Version */}
                          <td className="px-4 py-4 font-mono text-xs text-slate-400">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              v{game.configVersion}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => openConfigModal(game)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all shadow-sm"
                            >
                              <Sliders className="w-3.5 h-3.5" />
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
      )}

      {/* TAB 2: GAME SETTINGS & TIMEOUT CONFIGURATION (ALL 10 GAMES) */}
      {activeTab === 'timeouts' && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-600 text-white font-bold">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  Centralized Game Time & Timeout Resolution Strategy
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Configure maximum match duration (up to 10 minutes) and game-specific authoritative tie-break resolutions.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-500 font-bold border border-indigo-500/20">
              Active Match Snapshot Protected
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {games.map((game) => {
              const def = defMap.get(game.gameId as GameId);
              return (
                <div
                  key={game.gameId}
                  className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4 hover:border-indigo-500/40 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-2xl shadow-inner">
                        {def?.icon ?? '🎮'}
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 dark:text-white text-base">
                          {game.name}
                        </h4>
                        <span className="text-[11px] font-mono text-slate-400">v{game.configVersion}</span>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        game.enabled
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                      }`}
                    >
                      {game.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  <div className="space-y-2.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Maximum Match Time:</span>
                      <span className="font-bold text-slate-900 dark:text-white font-mono">
                        {Math.floor((game.matchDurationSeconds ?? 600) / 60)}m {(game.matchDurationSeconds ?? 600) % 60}s ({(game.matchDurationSeconds ?? 600)}s)
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Turn Timeout:</span>
                      <span className="font-bold text-slate-900 dark:text-white font-mono">
                        {game.turnTimerSeconds > 0 ? `${game.turnTimerSeconds} seconds` : 'N/A (Real-time)'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Timeout Resolution:</span>
                      <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20 text-[11px]">
                        {game.timeoutResolution?.replace(/_/g, ' ') || 'GAME SPECIFIC'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Allow Draw / Tie:</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {game.allowDraw !== false ? 'Yes (Supported)' : 'No'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => openConfigModal(game)}
                    className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <Settings2 className="w-4 h-4" />
                    Edit Game Settings
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: GLOBAL MATCH SETTINGS */}
      {activeTab === 'global' && (
        <div className="max-w-3xl space-y-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-500" />
                Global Platform Match Limits
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Configure platform-wide maximum duration safety ceilings and countdown warning triggers.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                  Maximum Match Duration (Platform Ceiling)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={30}
                    max={600}
                    value={matchSettings.maxMatchDurationSeconds}
                    onChange={(e) =>
                      setMatchSettings({
                        ...matchSettings,
                        maxMatchDurationSeconds: Math.min(600, parseInt(e.target.value, 10) || 600),
                      })
                    }
                    className="w-40 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 font-mono"
                  />
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    {Math.floor(matchSettings.maxMatchDurationSeconds / 60)} minutes ({matchSettings.maxMatchDurationSeconds} seconds)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  * Hard platform ceiling: 600s (10 minutes). No individual game may exceed this limit.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                  Default Turn Timeout (Seconds)
                </label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={matchSettings.defaultTurnTimeoutSeconds}
                  onChange={(e) =>
                    setMatchSettings({
                      ...matchSettings,
                      defaultTurnTimeoutSeconds: parseInt(e.target.value, 10) || 30,
                    })
                  }
                  className="w-40 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                  Warning Checkpoint Notifications
                </label>
                <div className="flex flex-wrap gap-2">
                  {matchSettings.warningTimesSeconds.map((sec) => (
                    <span
                      key={sec}
                      className="px-3 py-1.5 rounded-xl bg-indigo-500/10 text-indigo-500 font-mono text-xs font-bold border border-indigo-500/20"
                    >
                      ⏱ {sec >= 60 ? `${Math.floor(sec / 60)} min` : `${sec} sec`}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Visual alerts dispatched to clients when timer drops below checkpoints.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={handleSaveMatchSettings}
                disabled={isSavingMatchSettings}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSavingMatchSettings ? 'Saving...' : 'Save Global Match Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 backdrop-blur-md overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-black text-slate-900 dark:text-white text-sm">
              Configuration Change History & Audit Logs
            </h3>
            <span className="text-xs text-slate-400">{auditLogs.length} recent operations logged</span>
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
                        v{log.meta?.configVersion ?? '?'} - {JSON.stringify(log.meta?.newConfig?.entryFees ?? log.meta?.newConfig?.matchDurationSeconds ?? '')}
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
                      <Coins className="w-3.5 h-3.5 text-amber-400" /> {fee}
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
                    className="flex-1 px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm transition-all"
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
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Default Entry Fee
                  </label>
                  <select
                    value={formData.defaultEntryFee}
                    onChange={(e) => setFormData({ ...formData, defaultEntryFee: parseInt(e.target.value, 10) })}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm transition-all"
                  >
                    {formData.entryFees?.map((fee) => (
                      <option key={fee} value={fee} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                        {fee} Coins
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Min Players
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formData.minPlayers ?? 2}
                    onChange={(e) => setFormData({ ...formData, minPlayers: parseInt(e.target.value, 10) })}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Max Players
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formData.maxPlayers ?? 2}
                    onChange={(e) => setFormData({ ...formData, maxPlayers: parseInt(e.target.value, 10) })}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm transition-all"
                  />
                </div>
              </div>

              {/* Timers */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Turn Timeout (s)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={600}
                    value={formData.turnTimerSeconds ?? 30}
                    onChange={(e) => setFormData({ ...formData, turnTimerSeconds: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm transition-all"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {formData.turnTimerSeconds === 0 ? '0 = Real-time' : `${formData.turnTimerSeconds}s per turn`}
                  </span>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Maximum Match Duration (s)
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={600}
                    value={formData.matchDurationSeconds ?? 600}
                    onChange={(e) => setFormData({ ...formData, matchDurationSeconds: Math.min(600, parseInt(e.target.value, 10) || 600) })}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm transition-all"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Max: 600s ({Math.floor((formData.matchDurationSeconds ?? 600) / 60)}m {(formData.matchDurationSeconds ?? 600) % 60}s)
                  </span>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                    Reconnect Grace (s)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={formData.reconnectWindowSeconds ?? 30}
                    onChange={(e) => setFormData({ ...formData, reconnectWindowSeconds: parseInt(e.target.value, 10) })}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm transition-all"
                  />
                </div>
              </div>

              {/* Timeout Resolution & Draw Policy */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-indigo-500" />
                    10-Minute Timeout Tiebreaker Resolution
                  </h4>
                  <span className="text-xs text-slate-400 font-mono">Server Authoritative</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                      Timeout Resolution Strategy
                    </label>
                    <select
                      value={formData.timeoutResolution ?? "GAME_SPECIFIC"}
                      onChange={(e) => setFormData({ ...formData, timeoutResolution: e.target.value as TimeoutResolution })}
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                    >
                      <option value="CURRENT_POSITION">Board Position (Closest to 100)</option>
                      <option value="CURRENT_PROGRESS">Token Progress towards Home</option>
                      <option value="CONFIGURED_CHESS_RESOLUTION">Material Balance & Clock Time</option>
                      <option value="CURRENT_SCORE">Highest Slice / Mass Score</option>
                      <option value="CURRENT_SCORE_PROGRESS">Highest Score & Remaining Bubbles</option>
                      <option value="CURRENT_MATCH_SCORE">Sets Won & Current Set Points</option>
                      <option value="CURRENT_RUNS">Runs Scored & Wickets Lost</option>
                      <option value="CURRENT_POINTS">Pocketed Assigned Coins & Queen</option>
                      <option value="CURRENT_FRAME_SCORE">Frame Points & Highest Break</option>
                      <option value="GAME_SPECIFIC">Rule Engine Standard Tiebreak</option>
                      <option value="DRAW">Authoritative Co-Winner Draw</option>
                    </select>
                  </div>

                  <div className="flex items-center">
                    <label className="flex items-center gap-3 cursor-pointer pt-4">
                      <input
                        type="checkbox"
                        checked={formData.allowDraw !== false}
                        onChange={(e) => setFormData({ ...formData, allowDraw: e.target.checked })}
                        className="size-5 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
                      />
                      <div>
                        <p className="font-bold text-sm text-slate-900 dark:text-white">Allow Draw / Tie</p>
                        <p className="text-xs text-slate-400">Co-winners share pot or receive refund</p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Prize & Draw Configuration */}
              <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-500/20 space-y-4">
                <h4 className="font-bold text-sm text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
                  Prize Settlement & Draw Policy
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block mb-1.5">
                      Prize Mode
                    </label>
                    <select
                      value={formData.prizeMode}
                      onChange={(e) => setFormData({ ...formData, prizeMode: e.target.value as PrizeMode })}
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm transition-all"
                    >
                      {PRIZE_MODES.map((pm) => (
                        <option key={pm} value={pm} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                          {pm.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block mb-1.5">
                      Winner Percentage (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={formData.winnerPercentage ?? 90}
                      onChange={(e) => setFormData({ ...formData, winnerPercentage: parseInt(e.target.value, 10) })}
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block mb-1.5">
                    Draw Policy
                  </label>
                  <select
                    value={formData.drawPolicy}
                    onChange={(e) => setFormData({ ...formData, drawPolicy: e.target.value as DrawPolicy })}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm transition-all"
                  >
                    {DRAW_POLICIES.map((dp) => (
                      <option key={dp} value={dp} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                        {dp.replace(/_/g, ' ')}
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
