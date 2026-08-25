import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Search, Filter, ChevronLeft, ChevronRight, Loader2, Trash2, Edit, Eye, Plus } from 'lucide-react';
import { GAME_DEFINITIONS } from '@gaming-hub/shared';
import type { TournamentStatus, TournamentFormat, GameId } from '@gaming-hub/shared';
import { adminApi } from '../../services/api/enterprise';
import type { AdminTournamentDetail } from '../../services/api/enterprise';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';

const gameById = new Map(GAME_DEFINITIONS.map((g) => [g.id, g]));

const STATUS_VARIANT: Record<TournamentStatus, 'success' | 'warning' | 'danger' | 'default' | 'accent' | 'outline'> = {
  DRAFT: 'outline',
  REGISTRATION_OPEN: 'accent',
  REGISTRATION_CLOSED: 'default',
  UPCOMING: 'default',
  STARTING: 'warning',
  IN_PROGRESS: 'success',
  PAUSED: 'warning',
  COMPLETED: 'accent',
  SETTLING: 'warning',
  SETTLED: 'success',
  LIVE: 'success',
  ENDED: 'default',
  CANCELLED: 'danger',
};

const ALL_STATUSES: TournamentStatus[] = [
  'DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'UPCOMING',
  'STARTING', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'SETTLING',
  'SETTLED', 'LIVE', 'ENDED', 'CANCELLED',
];

const EMPTY_FORM = {
  gameId: 'chess' as GameId,
  title: '',
  description: '',
  format: 'SINGLE_ELIMINATION' as TournamentFormat,
  prizePool: 1000,
  entryFee: 0,
  minPlayers: 2,
  maxPlayers: 16,
  startTime: '',
  registrationEndsAt: '',
};

export function AdminTournamentsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AdminTournamentDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterGame, setFilterGame] = useState<string>('');
  const [filterFormat, setFilterFormat] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const load = async (p = page) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.tournaments(p, pageSize, filterStatus || undefined);
      setItems(data.items as unknown as AdminTournamentDetail[]);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournaments');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(1); setPage(1); }, [filterStatus]);

  const flash = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const filteredItems = useMemo(() => {
    return items.filter((t) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q)) return false;
      }
      if (filterGame && t.gameId !== filterGame) return false;
      if (filterFormat && t.format !== filterFormat) return false;
      return true;
    });
  }, [items, searchQuery, filterGame, filterFormat]);

  const handleCreate = async () => {
    if (!form.title || !form.startTime) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        startTime: new Date(form.startTime).toISOString(),
      };
      if (form.registrationEndsAt) {
        payload.registrationEndsAt = new Date(form.registrationEndsAt).toISOString();
      }
      await adminApi.createTournament(payload);
      setShowCreateModal(false);
      flash('Tournament created');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tournament');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tournament? This cannot be undone.')) return;
    setError(null);
    try {
      await adminApi.deleteTournament(id);
      flash('Tournament deleted');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tournament');
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-8 rounded-[2rem] bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
              <Trophy className="size-6 text-indigo-300" />
            </div>
            <div>
              <h1 className="text-2xl font-black">Tournaments</h1>
              <p className="text-sm text-indigo-200">{total} total tournaments</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigate('/admin/tournaments/disputes')}
              className="border-indigo-400/40 bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 font-bold"
            >
              🚩 Disputes Queue
            </Button>
            <Button variant="primary" onClick={() => {
              setForm({ ...EMPTY_FORM, startTime: new Date(Date.now() + 86400000).toISOString().slice(0, 16) });
              setShowCreateModal(true);
            }}>
              <Plus className="size-4" /> Create Tournament
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or ID..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-slate-400" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">All Status</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <select
            value={filterGame}
            onChange={(e) => setFilterGame(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">All Games</option>
            {GAME_DEFINITIONS.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <select
            value={filterFormat}
            onChange={(e) => setFilterFormat(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">All Formats</option>
            <option value="SINGLE_ELIMINATION">Single Elimination</option>
            <option value="BRACKET">Bracket</option>
            <option value="KNOCKOUT">Knockout</option>
            <option value="ROUND_ROBIN">Round Robin</option>
            <option value="SWISS">Swiss</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3">Tournament</th>
                  <th className="px-4 py-3">Game</th>
                  <th className="px-4 py-3">Format</th>
                  <th className="px-4 py-3 text-right">Entry</th>
                  <th className="px-4 py-3 text-right">Prize Pool</th>
                  <th className="px-4 py-3 text-center">Players</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Starts</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredItems.map((t) => (
                  <tr
                    key={t.id}
                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    onClick={() => navigate(`/admin/tournaments/${t.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{t.title}</div>
                      <div className="max-w-[200px] truncate text-xs text-slate-400">{t.id.slice(0, 8)}...</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                      {gameById.get(t.gameId as GameId)?.name ?? t.gameId}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                      {t.format?.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
                      {t.entryFee.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
                      {(t.grossPool || t.prizePool).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center text-sm tabular-nums">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {t._count?.players ?? t.players?.length ?? 0}
                      </span>
                      <span className="text-slate-400">/{t.maxPlayers}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[t.status as TournamentStatus] ?? 'default'}>
                        {t.status?.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(t.startTime).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/admin/tournaments/${t.id}`)}
                          title="View details"
                        >
                          <Eye className="size-4" />
                        </Button>
                        {['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED'].includes(t.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(t.id)}
                            title="Delete"
                          >
                            <Trash2 className="size-4 text-rose-500" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-400">
                      No tournaments found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(page - 1); load(page - 1); }}>
              <ChevronLeft className="size-4" /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(page + 1); load(page + 1); }}>
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Tournament"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button variant="primary" loading={isSubmitting} onClick={handleCreate}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              placeholder="Tournament title"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              placeholder="Optional description"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Game</label>
              <select
                value={form.gameId}
                onChange={(e) => setForm({ ...form, gameId: e.target.value as GameId })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                {GAME_DEFINITIONS.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Format</label>
              <select
                value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value as TournamentFormat })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="SINGLE_ELIMINATION">Single Elimination</option>
                <option value="BRACKET">Bracket</option>
                <option value="KNOCKOUT">Knockout</option>
                <option value="ROUND_ROBIN">Round Robin</option>
                <option value="SWISS">Swiss</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Prize Pool</label>
              <input
                type="number"
                value={form.prizePool}
                onChange={(e) => setForm({ ...form, prizePool: e.target.valueAsNumber })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Entry Fee</label>
              <input
                type="number"
                value={form.entryFee}
                onChange={(e) => setForm({ ...form, entryFee: e.target.valueAsNumber })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Min Players</label>
              <input
                type="number"
                value={form.minPlayers}
                onChange={(e) => setForm({ ...form, minPlayers: e.target.valueAsNumber })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Max Players</label>
              <input
                type="number"
                value={form.maxPlayers}
                onChange={(e) => setForm({ ...form, maxPlayers: e.target.valueAsNumber })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Start Time</label>
              <input
                type="datetime-local"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Registration Ends</label>
              <input
                type="datetime-local"
                value={form.registrationEndsAt}
                onChange={(e) => setForm({ ...form, registrationEndsAt: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
