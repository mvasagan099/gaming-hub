import { useEffect, useState } from 'react';
import { adminApi } from '../../services/api/enterprise';
import type { Announcement, AnnouncementType } from '@gaming-hub/shared';

const TYPE_STYLES: Record<AnnouncementType, string> = {
  INFO: 'bg-blue-500/10 text-blue-600',
  UPDATE: 'bg-purple-500/10 text-purple-600',
  MAINTENANCE: 'bg-yellow-500/10 text-yellow-600',
  PROMOTION: 'bg-green-500/10 text-green-600',
  ALERT: 'bg-red-500/10 text-red-600',
};

const EMPTY_FORM = {
  title: '',
  body: '',
  type: 'INFO' as AnnouncementType,
  imageUrl: '' as string,
  targetRole: '' as string,
  startsAt: '' as string,
  expiresAt: '' as string,
};

export function AdminAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.announcements(1, 100);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load announcements');
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
    setForm({ ...EMPTY_FORM, startsAt: new Date().toISOString().slice(0, 16) });
    setShowModal(true);
  };

  const openEdit = (a: Announcement) => {
    setEditing(a);
    setForm({
      title: a.title,
      body: a.body,
      type: a.type,
      imageUrl: a.imageUrl ?? '',
      targetRole: a.targetRole ?? '',
      startsAt: a.startsAt ? a.startsAt.slice(0, 16) : '',
      expiresAt: a.expiresAt ? a.expiresAt.slice(0, 16) : '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.body) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...form,
        imageUrl: form.imageUrl || null,
        targetRole: form.targetRole || null,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      };
      if (editing) {
        await adminApi.updateAnnouncement(editing.id, payload);
        flash('Announcement updated');
      } else {
        await adminApi.createAnnouncement(payload);
        flash('Announcement created');
      }
      setShowModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save announcement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    setError(null);
    try {
      await adminApi.deleteAnnouncement(id);
      await load();
      flash('Announcement deleted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete announcement');
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
        <h1 className="text-3xl font-bold">Announcements</h1>
        <button
          onClick={openCreate}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Create Announcement
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

      <div className="space-y-4">
        {items.map((a) => (
          <div key={a.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between">
              <div className="mr-4">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-1 text-xs ${TYPE_STYLES[a.type]}`}>{a.type}</span>
                  {a.targetRole && (
                    <span className="rounded-full bg-muted px-2 py-1 text-xs">Role: {a.targetRole}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString()}
                  </span>
                </div>
                <h2 className="mt-2 text-lg font-semibold">{a.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
                {(a.startsAt || a.expiresAt) && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {a.startsAt && <>Starts: {new Date(a.startsAt).toLocaleString()}</>}
                    {a.expiresAt && <> · Expires: {new Date(a.expiresAt).toLocaleString()}</>}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => openEdit(a)}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
            No announcements yet
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50">
          <div className="max-h-[90vh] w-[560px] overflow-y-auto rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold">
              {editing ? 'Edit Announcement' : 'Create Announcement'}
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
                <label className="mb-2 block text-sm font-medium">Body</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={4}
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as AnnouncementType })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    <option value="INFO">Info</option>
                    <option value="UPDATE">Update</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="PROMOTION">Promotion</option>
                    <option value="ALERT">Alert</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Target Role (optional)</label>
                  <select
                    value={form.targetRole}
                    onChange={(e) => setForm({ ...form, targetRole: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    <option value="">Everyone</option>
                    <option value="ADMIN">Admins</option>
                    <option value="MODERATOR">Moderators</option>
                    <option value="USER">Users</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Starts At</label>
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Expires At</label>
                  <input
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-2 block text-sm font-medium">Image URL (optional)</label>
                  <input
                    type="text"
                    value={form.imageUrl}
                    onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
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
                disabled={isSubmitting || !form.title || !form.body}
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
