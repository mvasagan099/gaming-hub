import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Search } from 'lucide-react';
import { messagesApi } from '../../services/api/enterprise';
import { searchApi } from '../../services/api/enterprise';
import type { ConversationSummary, Message, PublicUserSummary } from '@gaming-hub/shared';
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
  const [startUserId, setStartUserId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [userResults, setUserResults] = useState<PublicUserSummary[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const results = await searchApi.search(searchQuery.trim(), 'USERS');
      setUserResults(results.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    }
  };

  const handleStart = async (userId: string) => {
    setError(null);
    try {
      const conv = await messagesApi.start(userId);
      setStartUserId('');
      setSearchQuery('');
      setUserResults([]);
      await loadConversations();
      setSelectedId(conv.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start conversation');
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
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (!e.target.value) setUserResults([]);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
                  placeholder="Search users..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3 py-2 text-sm"
                />
              </div>
              {userResults.length > 0 && (
                <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  {userResults.map((u) => (
                    <li key={u.id}>
                      <button
                        onClick={() => void handleStart(u.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span className={`h-2 w-2 rounded-full ${u.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        <span className="font-semibold text-slate-900 dark:text-white">{u.displayName}</span>
                        <span className="text-xs text-slate-500">@{u.username}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {startUserId && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={startUserId}
                    onChange={(e) => setStartUserId(e.target.value)}
                    placeholder="User ID"
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                  />
                  <Button variant="primary" size="sm" onClick={() => void handleStart(startUserId)}>
                    Start
                  </Button>
                </div>
              )}
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
