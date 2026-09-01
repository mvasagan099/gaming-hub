import { useEffect, useState } from 'react';
import { LifeBuoy, Send } from 'lucide-react';
import { ticketsApi } from '../../services/api/enterprise';
import type { SupportTicket, TicketMessage, TicketStatus, TicketPriority } from '@gaming-hub/shared';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/ui/Button';

const STATUS_STYLES: Record<TicketStatus, string> = {
  OPEN: 'bg-green-500/10 text-green-600',
  PENDING: 'bg-yellow-500/10 text-yellow-600',
  RESOLVED: 'bg-blue-500/10 text-blue-600',
  CLOSED: 'bg-gray-500/10 text-gray-600',
};

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  LOW: 'bg-gray-500/10 text-gray-600',
  MEDIUM: 'bg-blue-500/10 text-blue-600',
  HIGH: 'bg-orange-500/10 text-orange-600',
  URGENT: 'bg-red-500/10 text-red-600',
};

export const TicketsPage: React.FC = () => {
  const [items, setItems] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<(SupportTicket & { messages?: TicketMessage[] }) | null>(null);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('Billing');
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM');
  const [body, setBody] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ticketsApi.list(1, 50);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!subject.trim() || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await ticketsApi.create({ subject, category, priority, body });
      setShowCreate(false);
      setSubject('');
      setBody('');
      setCategory('Billing');
      setPriority('MEDIUM');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const openTicket = async (id: string) => {
    setError(null);
    try {
      const detail = await ticketsApi.get(id);
      setSelected(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket');
    }
  };

  const handleReply = async () => {
    if (!selected || !reply.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await ticketsApi.reply(selected.id, reply.trim());
      setReply('');
      await openTicket(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Support</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Contact our team and track your requests.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate((v) => !v)}>
          <LifeBuoy className="mr-1.5 h-3.5 w-3.5" /> New ticket
        </Button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-600">{error}</div>
      )}

      {showCreate && (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 space-y-4">
          <h3 className="text-sm font-black text-slate-900 dark:text-white">Create a support ticket</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief description of your issue"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm"
              >
                <option>Billing</option>
                <option>Account</option>
                <option>Game issue</option>
                <option>Withdrawal</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Details</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder="Describe the issue in detail"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleCreate} disabled={submitting || !subject.trim() || !body.trim()}>
              {submitting ? 'Submitting...' : 'Submit ticket'}
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white">
            Your tickets ({items.length})
          </div>
          {items.length === 0 ? (
            <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No tickets yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((t) => (
                <li
                  key={t.id}
                  onClick={() => void openTicket(t.id)}
                  className={`cursor-pointer px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${selected?.id === t.id ? 'bg-slate-50 dark:bg-slate-800/50' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{t.subject}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[t.status]}`}>
                      {t.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className={`rounded-full px-2 py-0.5 ${PRIORITY_STYLES[t.priority]}`}>{t.priority}</span>
                    <span>{t.category}</span>
                    <span>· {new Date(t.updatedAt).toLocaleDateString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden flex flex-col">
          {selected ? (
            <>
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">{selected.subject}</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {selected.category} · {selected.priority} priority · {selected.status}
                </p>
              </div>
              <div className="flex-1 space-y-3 p-6 overflow-y-auto max-h-[360px]">
                {selected.messages?.map((m) => (
                  <div key={m.id} className={`rounded-2xl p-3 ${m.isStaff ? 'ml-8 bg-accent-500/10 text-right' : 'mr-8 bg-slate-100 dark:bg-slate-800 text-left'}`}>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {m.isStaff ? 'Support' : 'You'} · {new Date(m.createdAt).toLocaleString()}
                    </p>
                    <p className="mt-1 text-sm text-slate-900 dark:text-white">{m.body}</p>
                  </div>
                ))}
                {selected.messages?.length === 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center">No messages yet.</p>
                )}
              </div>
              {selected.status !== 'CLOSED' && selected.status !== 'RESOLVED' && (
                <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex gap-2">
                  <input
                    type="text"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void handleReply()}
                    placeholder="Write a reply..."
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm"
                  />
                  <Button variant="primary" size="sm" onClick={() => void handleReply()} disabled={submitting || !reply.trim()}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500 dark:text-slate-400">
              Select a ticket to view the conversation
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
