import { useEffect, useState } from 'react';
import { adminApi } from '../../services/api/enterprise';
import { GAME_DEFINITIONS } from '@gaming-hub/shared';
import type { TournamentStatus, TournamentFormat, GameId } from '@gaming-hub/shared';

interface AdminTournament {
  id: string;
  gameId: GameId;
  title: string;
  description: string;
  format: TournamentFormat;
  prizePool: number;
  entryFee: number;
  maxPlayers: number;
  registeredCount: number;
  startTime: string;
  status: TournamentStatus;
  createdAt: string;
}

const gameById = new Map(GAME_DEFINITIONS.map((g) => [g.id, g]));

const STATUS_STYLES: Record<TournamentStatus, string> = {
  UPCOMING: 'bg-blue-500/10 text-blue-600',
  LIVE: 'bg-green-500/10 text-green-600',
  ENDED: 'bg-gray-500/10 text-gray-600',
  CANCELLED: 'bg-red-500/10 text-red-600',
};

const EMPTY_FORM = {
  gameId: 'chess' as GameId,
  title: '',
  description: '',
  format: 'BRACKET' as TournamentFormat,
  prizePool: 1000,
  entryFee: 0,
  maxPlayers: 16,
  startTime: '',
};

export function AdminTournamentsPage() {
  const [items, setItems] = useState<AdminTournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AdminTournament | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.tournaments(1, 100);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournaments');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const flash = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, startTime: new Date(Date.now() + 86400000).toISOString().slice(0, 16) });
    setShowModal(true);
  };

  const openEdit = (item: AdminTournament) => {
    setEditing(item);
    setForm({
      gameId: item.gameId,
      title: item.title,
      description: item.description,
      format: item.format,
      prizePool: item.prizePool,
      entryFee: item.entryFee,
      maxPlayers: item.maxPlayers,
      startTime: item.startTime.slice(0, 16),
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.startTime) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...form,
        startTime: new Date(form.startTime).toISOString(),
      };
      if (editing) {
        await adminApi.updateTournament(editing.id, payload);
        flash('Tournament updated');
      } else {
        await adminApi.createTournament(payload);
        flash('Tournament created');
      }
      setShowModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tournament');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatus = async (id: string, status: TournamentStatus) => {
    setError(null);
    try {
      await adminApi.setTournamentStatus(id, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tournament? This cannot be undone.')) return;
    setError(null);
    try {
      await adminApi.deleteTournament(id);
      await load();
      flash('Tournament deleted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tournament');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Tournaments</h1>
        <button
          onClick={openCreate}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Create Tournament
        </button>
      </div>

      {successMessage && (
        <div className="mb-4 rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr className="text-left text-sm text-muted-foreground">
              <th className="px-4 py-3">Tournament</th>
              <th className="px-4 py-3">Game</th>
              <th className="px-4 py-3">Format</th>
              <th className="px-4 py-3">Prize Pool</th>
              <th className="px-4 py-3">Entry</th>
              <th className="px-4 py-3">Players</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Starts</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-b border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{t.title}</div>
                  <div className="max-w-[260px] truncate text-xs text-muted-foreground">
                    {t.description || 'No description'}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">{gameById.get(t.gameId)?.name ?? t.gameId}</td>
                <td className="px-4 py-3 text-sm">{t.format}</td>
                <td className="px-4 py-3 text-sm">{t.prizePool.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm">{t.entryFee.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm">
                  {t.registeredCount}/{t.maxPlayers}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs ${STATUS_STYLES[t.status]}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">{new Date(t.startTime).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openEdit(t)}
                      className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      Edit
                    </button>
                    {t.status !== 'LIVE' && t.status !== 'ENDED' && (
                      <button
                        onClick={() => handleStatus(t.id, 'LIVE')}
                        className="rounded bg-green-500 px-2 py-1 text-xs text-white hover:bg-green-600"
                      >
                        Start
                      </button>
                    )}
                    {t.status !== 'CANCELLED' && t.status !== 'ENDED' && (
                      <button
                        onClick={() => handleStatus(t.id, 'CANCELLED')}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No tournaments yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50">
          <div className="max-h-[90vh] w-[520px] overflow-y-auto rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold">
              {editing ? 'Edit Tournament' : 'Create Tournament'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">Game</label>
                  <select
                    value={form.gameId}
                    onChange={(e) => setForm({ ...form, gameId: e.target.value as GameId })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    {GAME_DEFINITIONS.map((game) => (
                      <option key={game.id} value={game.id}>
                        {game.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Format</label>
                  <select
                    value={form.format}
                    onChange={(e) => setForm({ ...form, format: e.target.value as TournamentFormat })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    <option value="BRACKET">Bracket</option>
                    <option value="KNOCKOUT">Knockout</option>
                    <option value="ROUND_ROBIN">Round Robin</option>
                    <option value="SWISS">Swiss</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Prize Pool</label>
                  <input
                    type="number"
                    value={form.prizePool}
                    onChange={(e) => setForm({ ...form, prizePool: e.target.valueAsNumber })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Entry Fee</label>
                  <input
                    type="number"
                    value={form.entryFee}
                    onChange={(e) => setForm({ ...form, entryFee: e.target.valueAsNumber })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Max Players</label>
                  <input
                    type="number"
                    value={form.maxPlayers}
                    onChange={(e) => setForm({ ...form, maxPlayers: e.target.valueAsNumber })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Start Time</label>
                  <input
                    type="datetime-local"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </div>
              </div>
              {error && (
                <div className="rounded-md border border-red-500/50 bg-red-500/10 p-2 text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowModal(false);
                  setError(null);
                }}
                disabled={isSubmitting}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSubmitting || !form.title || !form.startTime}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : editing ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
