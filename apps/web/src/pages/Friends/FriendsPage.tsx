import { useEffect, useRef, useState } from 'react';
import { Check, UserPlus, Users, X, Ban, Loader2, UserCheck, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { friendsApi, messagesApi, usersApi, type FriendEntry, type UserSearchResult } from '../../services/api/enterprise';
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

  // Suggestions state
  const [suggestions, setSuggestions] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [sendingUsernames, setSendingUsernames] = useState<Record<string, boolean>>({});
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

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

  // Click outside to dismiss dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Debounced search on username typing
  useEffect(() => {
    const raw = username.trim().replace(/^@+/, '');
    if (!raw) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await usersApi.search(raw, 8);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 220);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [username]);

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

  const handleSend = async (targetUser?: string) => {
    const target = (targetUser ?? username).trim().replace(/^@+/, '');
    if (!target) return;
    setSending(true);
    setActionError(null);
    try {
      await friendsApi.send(target);
      toast.success(`Friend request sent to @${target}`);
      setUsername('');
      setShowDropdown(false);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send request';
      setActionError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const handleQuickAdd = async (targetUsername: string) => {
    setSendingUsernames((prev) => ({ ...prev, [targetUsername]: true }));
    setActionError(null);
    try {
      await friendsApi.send(targetUsername);
      toast.success(`Friend request sent to @${targetUsername}`);
      setUsername('');
      setShowDropdown(false);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send request';
      setActionError(msg);
      toast.error(msg);
    } finally {
      setSendingUsernames((prev) => ({ ...prev, [targetUsername]: false }));
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
    <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 sm:pb-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Friends</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Find players, send requests, and grow your squad.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 sm:p-6 relative">
        <h3 className="text-sm font-black text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <span>Add a friend</span>
          <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500 hidden sm:inline">
            Type a username to see suggestions
          </span>
        </h3>

        <div ref={searchContainerRef} className="relative">
          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => {
                  if (username.trim().length > 0) setShowDropdown(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSend();
                  if (e.key === 'Escape') setShowDropdown(false);
                }}
                placeholder="Enter username (e.g. alex, shadow)"
                className="w-full min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 sm:px-4 py-2.5 sm:py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
                </div>
              )}
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={() => void handleSend()}
              disabled={sending || !username.trim()}
              className="w-full sm:w-auto justify-center whitespace-nowrap shrink-0"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <UserPlus className="h-4 w-4 shrink-0" />}
              <span>{sending ? 'Sending...' : 'Send request'}</span>
            </Button>
          </div>

          {/* Live Suggestions Dropdown */}
          {showDropdown && username.trim().length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 shadow-2xl overflow-hidden backdrop-blur-xl">
              <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold uppercase tracking-wider text-[10px]">
                  Matching Players
                </span>
                {isSearching ? (
                  <span className="flex items-center gap-1.5 text-accent-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> Searching...
                  </span>
                ) : (
                  <span>{suggestions.length} found</span>
                )}
              </div>

              {suggestions.length === 0 && !isSearching ? (
                <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                  No players found matching <span className="font-semibold text-slate-800 dark:text-slate-200">"{username}"</span>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                  {suggestions.map((u) => {
                    const isAlreadyFriend = friends.some(
                      (f) =>
                        f.friend.username.toLowerCase() === u.username.toLowerCase() ||
                        f.friend.userId === u.id
                    );
                    const isPending = requests.some(
                      (r) => r.requester.username?.toLowerCase() === u.username.toLowerCase()
                    );
                    const isBlocked = blocked.some(
                      (b) => b.username.toLowerCase() === u.username.toLowerCase()
                    );
                    const isAddingThis = sendingUsernames[u.username];

                    return (
                      <li
                        key={u.id || u.username}
                        onClick={() => {
                          setUsername(u.username);
                          setShowDropdown(false);
                        }}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            {u.avatarUrl ? (
                              <img
                                src={u.avatarUrl}
                                alt=""
                                className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-accent-600 to-indigo-600 flex items-center justify-center text-xs font-black text-white">
                                {(u.displayName || u.username).slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-850 ${
                                u.isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                {u.displayName}
                              </span>
                              {u.level && u.level > 1 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                                  Lv.{u.level}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-slate-500 dark:text-slate-400 block truncate">
                              @{u.username}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                          {isAlreadyFriend ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-500/20">
                              <UserCheck className="h-3 w-3" /> Friends
                            </span>
                          ) : isPending ? (
                            <span className="inline-flex items-center text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-500/20">
                              Request Pending
                            </span>
                          ) : isBlocked ? (
                            <span className="inline-flex items-center text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 rounded-full border border-rose-500/20">
                              Blocked
                            </span>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => void handleQuickAdd(u.username)}
                              disabled={isAddingThis || sending}
                              className="text-xs px-2.5 py-1 h-7"
                            >
                              {isAddingThis ? (
                                <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                              ) : (
                                <UserPlus className="h-3 w-3 shrink-0" />
                              )}
                              <span>{isAddingThis ? 'Adding...' : 'Add'}</span>
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
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
              <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <UserPlus size={16} className="text-accent-500" /> Friend requests ({requests.length})
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
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
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
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
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Users size={16} className="text-emerald-500" /> Your friends ({friends.length})
            </div>
            {friends.length === 0 ? (
              <p className="p-4 sm:p-6 text-sm text-slate-500 dark:text-slate-400">No friends yet. Add someone to get started.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {friends.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
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
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          @{entry.friend.username} · {entry.friend.isOnline ? 'Online' : 'Offline'}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => void handleRemove(entry.friend.userId)} disabled={busyId === entry.friend.userId} className="shrink-0">
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Ban size={16} className="text-rose-500" /> Blocked users ({blocked.length})
            </div>
            {blocked.length === 0 ? (
              <p className="p-4 sm:p-6 text-sm text-slate-500 dark:text-slate-400">
                You haven't blocked anyone. Blocked users can't message you.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {blocked.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center text-sm font-black text-rose-500 overflow-hidden shrink-0">
                        {b.avatarUrl ? (
                          <img src={b.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (b.displayName || b.username || '?').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {b.displayName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">@{b.username}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => void handleUnblock(b.blockedId)} disabled={busyId === b.blockedId} className="shrink-0">
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
