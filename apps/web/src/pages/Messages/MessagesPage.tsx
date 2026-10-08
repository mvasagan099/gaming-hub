import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Search, Loader2, X, MessageSquarePlus } from 'lucide-react';
import { messagesApi, usersApi, type UserSearchResult } from '../../services/api/enterprise';
import type { ConversationSummary, Message } from '@gaming-hub/shared';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/ui/Button';

export const MessagesPage: React.FC = () => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendText, setSendText] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [startingUserId, setStartingUserId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const loadConversations = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await messagesApi.conversations();
      setConversations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  // Dismiss search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Debounced user search
  useEffect(() => {
    const raw = searchQuery.trim().replace(/^@+/, '');
    if (!raw) {
      setUserResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await usersApi.search(raw, 8);
        setUserResults(results);
      } catch {
        setUserResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 220);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (selectedId) {
      messagesApi.messages(selectedId, 1, 100).then((page) => setMessages(page.items)).catch(() => setMessages([]));
    } else {
      setMessages([]);
    }
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    void messagesApi.unreadCount().then(() => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
      );
    });
  };

  const handleSend = async () => {
    if (!selectedId || !sendText.trim()) return;
    setSending(true);
    setError(null);
    try {
      const msg = await messagesApi.send(selectedId, sendText.trim());
      setSendText('');
      setMessages((prev) => [...prev, msg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleStart = async (userId: string) => {
    setStartingUserId(userId);
    setError(null);
    try {
      const conv = await messagesApi.start(userId);
      setSearchQuery('');
      setUserResults([]);
      setShowSearchDropdown(false);
      await loadConversations();
      setSelectedId(conv.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start conversation');
    } finally {
      setStartingUserId(null);
    }
  };

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Messages</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Chat with other players. Start a conversation by searching for a user.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-600">{error}</div>
      )}

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
        <div className="grid md:grid-cols-[320px_1fr] min-h-[520px]">
          <div className="border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <div ref={searchContainerRef} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchDropdown(true);
                  }}
                  onFocus={() => {
                    if (searchQuery.trim().length > 0) setShowSearchDropdown(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setShowSearchDropdown(false);
                  }}
                  placeholder="Search users..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-8 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
                {isSearching ? (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
                  </div>
                ) : searchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setUserResults([]);
                      setShowSearchDropdown(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}

                {/* Floating Suggestions Dropdown */}
                {showSearchDropdown && searchQuery.trim().length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 shadow-2xl overflow-hidden backdrop-blur-xl">
                    <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold uppercase tracking-wider text-[10px]">
                        Users
                      </span>
                      {isSearching ? (
                        <span className="flex items-center gap-1.5 text-accent-500 text-[11px]">
                          <Loader2 className="h-3 w-3 animate-spin" /> Searching...
                        </span>
                      ) : (
                        <span className="text-[11px]">{userResults.length} found</span>
                      )}
                    </div>

                    {userResults.length === 0 && !isSearching ? (
                      <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                        No users found matching <span className="font-semibold text-slate-800 dark:text-slate-200">"{searchQuery}"</span>
                      </div>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                        {userResults.map((u) => {
                          const isStarting = startingUserId === u.id;
                          return (
                            <li key={u.id}>
                              <button
                                type="button"
                                onClick={() => void handleStart(u.id)}
                                disabled={isStarting}
                                className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="relative shrink-0">
                                    {u.avatarUrl ? (
                                      <img
                                        src={u.avatarUrl}
                                        alt=""
                                        className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                                      />
                                    ) : (
                                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-accent-600 to-indigo-600 flex items-center justify-center text-xs font-black text-white">
                                        {(u.displayName || u.username).slice(0, 1).toUpperCase()}
                                      </div>
                                    )}
                                    <span
                                      className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-white dark:border-slate-850 ${
                                        u.isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                                      }`}
                                    />
                                  </div>

                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                        {u.displayName}
                                      </span>
                                      {u.level && u.level > 1 && (
                                        <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                                          Lv.{u.level}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                                      @{u.username}
                                    </span>
                                  </div>
                                </div>

                                <span className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-accent-600 dark:text-accent-400 bg-accent-500/10 px-2 py-1 rounded-lg group-hover:bg-accent-500 group-hover:text-white transition-colors">
                                  {isStarting ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <MessageSquarePlus className="h-3 w-3" />
                                  )}
                                  <span>{isStarting ? 'Opening...' : 'Chat'}</span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>

            {loading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
                No conversations yet. Search for a player above to start chatting.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => handleSelect(c.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 ${selectedId === c.id ? 'bg-indigo-500/5' : ''}`}
                    >
                      <span className="w-10 h-10 rounded-full bg-indigo-500/15 flex items-center justify-center text-indigo-500 font-black shrink-0">
                        {c.otherUser.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {c.otherUser.displayName}
                          </p>
                          {c.lastMessage && (
                            <span className="text-[10px] text-slate-500 shrink-0 ml-2">
                              {new Date(c.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {c.lastMessage?.body ?? 'No messages yet'}
                          </p>
                          {c.unreadCount > 0 && (
                            <span className="shrink-0 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col">
            {selected ? (
              <>
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-indigo-500/15 flex items-center justify-center text-indigo-500 text-sm font-black">
                    {selected.otherUser.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{selected.otherUser.displayName}</p>
                    <p className="text-[10px] text-slate-500">
                      {selected.otherUser.isOnline ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 p-6 max-h-[400px]">
                  {messages.map((m) => {
                    const mine = m.senderId !== selected.otherUser.id;
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${mine ? 'bg-indigo-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'}`}>
                          <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                          <p className={`mt-0.5 text-[9px] ${mine ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
                            {new Date(m.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
                <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex gap-2">
                  <input
                    type="text"
                    value={sendText}
                    onChange={(e) => setSendText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void handleSend()}
                    placeholder="Type a message..."
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm"
                  />
                  <Button variant="primary" size="sm" onClick={() => void handleSend()} disabled={sending || !sendText.trim()}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-slate-500 dark:text-slate-400">
                <MessageCircle className="mb-3 h-10 w-10" />
                <p className="text-sm">Select a conversation to start chatting</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
