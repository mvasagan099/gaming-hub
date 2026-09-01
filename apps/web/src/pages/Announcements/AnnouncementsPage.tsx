import { useEffect, useState } from 'react';
import { Megaphone, CheckCheck } from 'lucide-react';
import { announcementsApi } from '../../services/api/enterprise';
import type { Announcement, AnnouncementType } from '@gaming-hub/shared';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/ui/Button';

const TYPE_STYLES: Record<AnnouncementType, string> = {
  INFO: 'bg-blue-500/10 text-blue-600',
  UPDATE: 'bg-purple-500/10 text-purple-600',
  MAINTENANCE: 'bg-yellow-500/10 text-yellow-600',
  PROMOTION: 'bg-green-500/10 text-green-600',
  ALERT: 'bg-red-500/10 text-red-600',
};

export const AnnouncementsPage: React.FC = () => {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, count] = await Promise.all([announcementsApi.list(1, 50), announcementsApi.unreadCount()]);
      setItems(data.items);
      setUnread(count.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await announcementsApi.markRead(id);
      setItems((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Announcements</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {unread > 0 ? `${unread} unread announcement${unread > 1 ? 's' : ''}` : 'You are all caught up'}
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-600">{error}</div>
      )}

      {items.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-10 text-center">
          <Megaphone className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No announcements yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((a) => (
            <div
              key={a.id}
              className={`rounded-3xl border p-6 transition-colors ${
                a.read
                  ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40'
                  : 'border-indigo-500/40 bg-indigo-500/5 dark:bg-indigo-500/10'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${TYPE_STYLES[a.type]}`}>{a.type}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {new Date(a.createdAt).toLocaleString()}
                </span>
                {!a.read && (
                  <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-600">NEW</span>
                )}
              </div>
              <h2 className="mt-2 text-lg font-black text-slate-900 dark:text-white">{a.title}</h2>
              <p className="mt-1 text-sm whitespace-pre-wrap text-slate-600 dark:text-slate-300">{a.body}</p>
              {(a.startsAt || a.expiresAt) && (
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  {a.startsAt && <>Starts: {new Date(a.startsAt).toLocaleString()}</>}
                  {a.expiresAt && <> · Expires: {new Date(a.expiresAt).toLocaleString()}</>}
                </p>
              )}
              {!a.read && (
                <div className="mt-4">
                  <Button variant="ghost" size="sm" onClick={() => void handleMarkRead(a.id)}>
                    <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> Mark as read
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
