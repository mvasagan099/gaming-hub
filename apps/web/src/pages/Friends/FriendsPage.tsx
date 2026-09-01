import { useEffect, useState } from 'react';
import { Check, UserPlus, Users, X, Ban } from 'lucide-react';
import { friendsApi, messagesApi, type FriendEntry } from '../../services/api/enterprise';
import type { BlockedUser, FriendRequest } from '@gaming-hub/shared';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/ui/Button';

export const FriendsPage: React.FC = () => {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, r, b] = await Promise.all([friendsApi.list(), friendsApi.requests(), messagesApi.blocked()]);
      setFriends(f);
      setRequests(r);
      setBlocked(b);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load friends');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleUnblock = async (blockedId: string) => {
    setBusyId(blockedId);
    setActionError(null);
    try {
      await messagesApi.unblock(blockedId);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to unblock user');
    } finally {
      setBusyId(null);
    }
  };

  const handleSend = async () => {
    if (!username.trim()) return;
    setSending(true);
    setActionError(null);
    try {
      await friendsApi.send(username.trim());
      setUsername('');
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to send request');
    } finally {
      setSending(false);
    }
  };

  const handleRespond = async (requestId: string, accept: boolean) => {
    setBusyId(requestId);
    setActionError(null);
    try {
      await friendsApi.respond(requestId, accept);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to respond');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (friendId: string) => {
    setBusyId(friendId);
    setActionError(null);
    try {
      await friendsApi.remove(friendId);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove friend');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Friends</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Find players, send requests, and grow your squad.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6">
        <h3 className="text-sm font-black text-slate-900 dark:text-white mb-3">Add a friend</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSend();
            }}
            placeholder="Enter username"
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm text-slate-900 dark:text-white"
          />
          <Button variant="primary" size="md" onClick={() => void handleSend()} disabled={sending || !username.trim()}>
            <UserPlus className="h-4 w-4" />
            {sending ? 'Sending...' : 'Send request'}
          </Button>
        </div>
        {actionError && <p className="mt-2 text-xs text-red-500">{actionError}</p>}
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-600">{error}</div>
      ) : (
        <>
          {requests.length > 0 && (
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <UserPlus size={16} className="text-accent-500" /> Friend requests ({requests.length})
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {requests.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-6 py-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-accent-600 flex items-center justify-center text-sm font-black text-white overflow-hidden">
                        {r.requester.avatarUrl ? (
                          <img src={r.requester.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (r.requester.displayName || r.requester.username || '?').slice(0, 1).toUpperCase()}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {r.requester.displayName}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">@{r.requester.username}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="primary" size="sm" onClick={() => void handleRespond(r.id, true)} disabled={busyId === r.id}>
                        <Check className="h-3.5 w-3.5" /> Accept
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void handleRespond(r.id, false)} disabled={busyId === r.id}>
                        <X className="h-3.5 w-3.5" /> Decline
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Users size={16} className="text-emerald-500" /> Your friends ({friends.length})
            </div>
            {friends.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No friends yet. Add someone to get started.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {friends.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 px-6 py-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-accent-600 flex items-center justify-center text-sm font-black text-white overflow-hidden">
                        {entry.friend.avatarUrl ? (
                          <img src={entry.friend.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (entry.friend.displayName || entry.friend.username || '?').slice(0, 1).toUpperCase()}
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${
                          entry.friend.isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {entry.friend.displayName}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        @{entry.friend.username} · {entry.friend.isOnline ? 'Online' : 'Offline'}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => void handleRemove(entry.friend.userId)} disabled={busyId === entry.friend.userId}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Ban size={16} className="text-rose-500" /> Blocked users ({blocked.length})
            </div>
            {blocked.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
                You haven't blocked anyone. Blocked users can't message you.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {blocked.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-6 py-3">
                    <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center text-sm font-black text-rose-500 overflow-hidden">
                      {b.avatarUrl ? (
                        <img src={b.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (b.displayName || b.username || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {b.displayName}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">@{b.username}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => void handleUnblock(b.blockedId)} disabled={busyId === b.blockedId}>
                      Unblock
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};
