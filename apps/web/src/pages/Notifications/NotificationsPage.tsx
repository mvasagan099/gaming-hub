import { useEffect, useState } from 'react';
import {
  Award,
  Bell,
  CheckCheck,
  Gift,
  Medal,
  Megaphone,
  MessageSquare,
  Swords,
  Ticket,
  Trophy,
  UserPlus,
  Wallet,
  XCircle,
} from 'lucide-react';
import { notificationsApi } from '../../services/api/enterprise';
import type { AppNotification, NotificationType } from '@gaming-hub/shared';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/ui/Button';

const TYPE_ICONS: Partial<Record<NotificationType, React.ComponentType<{ className?: string }>>> = {
  MATCH_INVITE: Swords,
  FRIEND_REQUEST: UserPlus,
  FRIEND_ACCEPTED: UserPlus,
  MATCH_RESULT: Trophy,
  TOURNAMENT: Trophy,
  SYSTEM: Bell,
  REFERRAL: Gift,
  COUPON: Ticket,
  ANNOUNCEMENT: Megaphone,
  MESSAGE: MessageSquare,
  SUPPORT: Ticket,
  PROMOTION: Gift,
  WALLET: Wallet,
  ACHIEVEMENT: Award,
  SYSTEM_ALERT: XCircle,
};

const TYPE_COLORS: Partial<Record<NotificationType, string>> = {
  MATCH_INVITE: 'text-blue-500 bg-blue-500/10',
  FRIEND_REQUEST: 'text-emerald-500 bg-emerald-500/10',
  FRIEND_ACCEPTED: 'text-emerald-500 bg-emerald-500/10',
  MATCH_RESULT: 'text-amber-500 bg-amber-500/10',
  TOURNAMENT: 'text-violet-500 bg-violet-500/10',
  SYSTEM: 'text-slate-500 bg-slate-500/10',
  REFERRAL: 'text-pink-500 bg-pink-500/10',
  COUPON: 'text-orange-500 bg-orange-500/10',
  ANNOUNCEMENT: 'text-cyan-500 bg-cyan-500/10',
  MESSAGE: 'text-blue-500 bg-blue-500/10',
  SUPPORT: 'text-teal-500 bg-teal-500/10',
  PROMOTION: 'text-pink-500 bg-pink-500/10',
  WALLET: 'text-amber-500 bg-amber-500/10',
  ACHIEVEMENT: 'text-yellow-500 bg-yellow-500/10',
  SYSTEM_ALERT: 'text-rose-500 bg-rose-500/10',
};

export const NotificationsPage: React.FC = () => {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [page, count] = await Promise.all([
        notificationsApi.list(1, 50),
        notificationsApi.unreadCount(),
      ]);
      setItems(page.items);
      setTotal(page.total);
      setUnread(count.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleMarkRead = async (id: string) => {
    if (items.find((n) => n.id === id)?.readAt) return;
    setBusyId(id);
    try {
      await notificationsApi.markRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
      setUnread((u) => Math.max(0, u - 1));
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkAll = async () => {
    await notificationsApi.markAllRead();
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnread(0);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {unread > 0 ? `${unread} unread` : 'You are all caught up'}
          </p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => void handleMarkAll()}>
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </Button>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-600">{error}</div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-10 text-center">
          <Bell className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">No notifications yet</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Matches, friends, tournaments, and rewards will show up here.
          </p>
        </div>
      ) : (
        <ul className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((n) => {
            const Icon = TYPE_ICONS[n.type] ?? Bell;
            return (
              <li key={n.id}>
                <button
                  onClick={() => void handleMarkRead(n.id)}
                  disabled={busyId === n.id}
                  className={`flex w-full items-start gap-3 px-6 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                    !n.readAt ? 'bg-accent-500/5' : ''
                  }`}
                >
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TYPE_COLORS[n.type] ?? 'bg-slate-500/10 text-slate-500'}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{n.title}</span>
                      {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-accent-500" />}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-300">{n.body}</span>
                    <span className="mt-1 block text-[11px] text-slate-400">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </span>
                  {n.type === 'ACHIEVEMENT' && (
                    <Medal className="mt-1 h-4 w-4 shrink-0 text-amber-500" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
