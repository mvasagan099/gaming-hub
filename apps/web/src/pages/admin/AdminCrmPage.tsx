import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../services/api/enterprise';
import type { SupportTicket, TicketMessage, TicketStatus, TicketPriority } from '@gaming-hub/shared';

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

export function AdminCrmPage() {
  const [items, setItems] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<(SupportTicket & { messages?: TicketMessage[] }) | null>(null);
  const [reply, setReply] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('OPEN');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.tickets(1, 50, statusFilter);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickets');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const openTicket = async (id: string) => {
    setError(null);
    try {
      const detail = await adminApi.ticketDetail(id);
      setSelected(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket');
    }
  };

  const flash = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleReply = async () => {
    if (!selected || !reply.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await adminApi.replyToTicket(selected.id, reply.trim());
      setReply('');
      await openTicket(selected.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatus = async (status: TicketStatus) => {
    if (!selected) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await adminApi.setTicketStatus(selected.id, status);
      await openTicket(selected.id);
      await load();
      flash(`Ticket marked ${status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setIsSubmitting(false);
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
        <h1 className="text-3xl font-bold">Support (CRM)</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="PENDING">Pending</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr className="text-left text-sm text-muted-foreground">
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => openTicket(t.id)}
                  className={`cursor-pointer border-b border-border hover:bg-muted/50 ${
                    selected?.id === t.id ? 'bg-muted/50' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{t.subject}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.user?.displayName ?? t.userId} · {t.category}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${PRIORITY_STYLES[t.priority]}`}>
                      {t.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${STATUS_STYLES[t.status]}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{new Date(t.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No tickets
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-border bg-card">
          {selected ? (
            <div className="flex h-full flex-col">
              <div className="border-b border-border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-semibold">{selected.subject}</h2>
                    <p className="text-xs text-muted-foreground">
                      {selected.user?.displayName ?? selected.userId} · {selected.category} ·{' '}
                      {selected.priority} priority
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      to={`/admin/users?userId=${encodeURIComponent(selected.userId)}`}
                      className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      View user 360
                    </Link>
                    {selected.status === 'OPEN' && (
                      <button
                        onClick={() => handleStatus('PENDING')}
                        disabled={isSubmitting}
                        className="rounded bg-yellow-500 px-2 py-1 text-xs text-white hover:bg-yellow-600"
                      >
                        Mark Pending
                      </button>
                    )}
                    {selected.status !== 'RESOLVED' && (
                      <button
                        onClick={() => handleStatus('RESOLVED')}
                        disabled={isSubmitting}
                        className="rounded bg-green-500 px-2 py-1 text-xs text-white hover:bg-green-600"
                      >
                        Resolve
                      </button>
                    )}
                    {selected.status !== 'CLOSED' && (
                      <button
                        onClick={() => handleStatus('CLOSED')}
                        disabled={isSubmitting}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                      >
                        Close
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {selected.messages?.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg p-3 ${
                      m.isStaff
                        ? 'ml-8 bg-primary/10 text-right'
                        : 'mr-8 bg-muted text-left'
                    }`}
                  >
                    <div className="text-xs text-muted-foreground">
                      {m.isStaff ? 'Staff' : 'User'} · {new Date(m.createdAt).toLocaleString()}
                    </div>
                    <div className="mt-1 text-sm">{m.body}</div>
                  </div>
                ))}
                {selected.messages?.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground">No messages yet</p>
                )}
              </div>
              <div className="border-t border-border p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleReply()}
                    placeholder="Write a reply..."
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleReply}
                    disabled={isSubmitting || !reply.trim()}
                    className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
              Select a ticket to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
