import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../ui/Modal';
import { friendsApi, type FriendEntry } from '../../services/api/enterprise';
import { roomInvitationsApi } from '../../services/api/roomInvitations';

export function InviteFriendsDialog({ roomId, isOpen, onClose }: { roomId: string; isOpen: boolean; onClose: () => void }) {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const sending = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++; sending.current = false; setBusy(null);
    if (!isOpen) return;
    let disposed = false;
    setLoading(true); setError(null); setSent([]);
    void friendsApi.list().then(items => { if (!disposed) setFriends(items); })
      .catch(error => { if (!disposed) setError(error instanceof Error ? error.message : 'Unable to load friends.'); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; generation.current++; };
  }, [isOpen, roomId]);
  const invite = async (id: string) => {
    if (sending.current) return;
    sending.current = true; setBusy(id); setError(null);
    const owner = generation.current;
    try { await roomInvitationsApi.send(roomId, id); if (owner === generation.current) setSent(previous => [...previous, id]); }
    catch (error) { if (owner === generation.current) setError(error instanceof Error ? error.message : 'Unable to send invitation.'); }
    finally { if (owner === generation.current) { sending.current = false; setBusy(null); } }
  };
  return <Modal isOpen={isOpen} onClose={onClose} title="Invite a Friend">
    <p className="mb-4 text-sm text-slate-500">Choose a friend. They’ll receive a request to join this private room.</p>
    {error && <p role="alert" className="mb-3 text-sm text-rose-500">{error}</p>}
    {loading ? <p role="status">Loading friends…</p> : friends.length === 0 ? <p className="text-sm">No friends yet. <Link to="/friends" onClick={onClose} className="text-indigo-500 underline">Add friends</Link> to invite them.</p> :
      <div className="max-h-80 overflow-y-auto space-y-2">{friends.map(({ friend }) => <div key={friend.userId} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
        <div className="min-w-0"><p className="font-bold truncate">{friend.displayName || friend.username}</p><p className="text-xs text-slate-500">@{friend.username} · {friend.isOnline ? 'Online' : 'Offline'}</p></div>
        <button disabled={!!busy || sent.includes(friend.userId)} onClick={() => void invite(friend.userId)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{sent.includes(friend.userId) ? 'Sent' : busy === friend.userId ? 'Sending…' : 'Invite'}</button>
      </div>)}</div>}
  </Modal>;
}
