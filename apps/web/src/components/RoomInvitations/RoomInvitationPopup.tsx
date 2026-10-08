import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GAME_BY_ID } from '@gaming-hub/shared';
import { Modal } from '../ui/Modal';
import { useAuthStore } from '../../store/authStore';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import { roomInvitationsApi, type RoomInvitation } from '../../services/api/roomInvitations';

export function RoomInvitationPopup() {
  const session = useAuthStore(s => s.session);
  const socket = useMultiplayerStore(s => s.socket);
  const socketStatus = useMultiplayerStore(s => s.status);
  const room = useMultiplayerStore(s => s.room);
  const connect = useMultiplayerStore(s => s.connect);
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<RoomInvitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const responding = useRef(false);
  const generation = useRef(0);
  const handled = useRef(new Set<string>());
  const loading = useRef(false);
  const refreshAgain = useRef(false);
  const latest = useRef({ pathname: location.pathname, invitationId: items[0]?.id });
  latest.current = { pathname: location.pathname, invitationId: items[0]?.id };
  const load = useCallback(async (): Promise<void> => {
    if (!session) return;
    if (loading.current) { refreshAgain.current = true; return; }
    loading.current = true;
    const owner = generation.current;
    try {
      const result = await roomInvitationsApi.pending();
      if (owner === generation.current) setItems(result.items.filter(item => !handled.current.has(item.id) && Date.parse(item.expiresAt) > Date.now()));
    } catch { /* A temporary notification outage must not interrupt gameplay. */ }
    finally {
      if (owner === generation.current) {
        loading.current = false;
        if (refreshAgain.current) { refreshAgain.current = false; void load(); }
      }
    }
  }, [session]);
  useEffect(() => {
    generation.current++; loading.current = false; refreshAgain.current = false;
    setItems([]); setError(null); setBusy(false); responding.current = false; handled.current.clear();
    if (!session) return;
    connect(); void load();
    const refresh = () => { if (document.visibilityState !== 'hidden') void load(); };
    const timer = window.setInterval(refresh, 10000);
    document.addEventListener('visibilitychange', refresh);
    return () => { generation.current++; window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [session, connect, load]);
  useEffect(() => {
    if (!socket) return;
    const refresh = () => { void load(); };
    socket.on('room:invitation', refresh);
    socket.on('connect', refresh);
    return () => { socket.off('room:invitation', refresh); socket.off('connect', refresh); };
  }, [socket, load]);
  const invitation = items[0];
  useEffect(() => { setError(null); }, [invitation?.id]);
  const inGame = /^\/games?\//.test(location.pathname);
  const occupied = !!room && room.id !== invitation?.roomId;
  const respond = async (accepted: boolean) => {
    if (!invitation || responding.current || (accepted && (occupied || inGame || socketStatus !== 'connected'))) return;
    responding.current = true; setBusy(true); setError(null);
    const owner = generation.current;
    const origin = latest.current.pathname;
    try {
      if (accepted) {
        const current = await roomInvitationsApi.resolve(invitation.id);
        if (owner !== generation.current) return;
        const store = useMultiplayerStore.getState();
        if (latest.current.pathname !== origin || /^\/games?\//.test(latest.current.pathname) ||
          (store.room && store.room.id !== current.roomId) || store.status !== 'connected') {
          throw new Error('Your game or connection changed. Leave your current room before joining.');
        }
        await store.joinRoom({ roomId: current.roomId });
        if (owner !== generation.current) return;
        // Joining is authoritative. A notification acknowledgement outage must
        // never strand a successfully joined player outside their lobby.
        void roomInvitationsApi.respond(invitation.id, true).catch(() => {});
        if (latest.current.pathname === origin) navigate(`/lobby/${current.gameId}`);
      } else {
        await roomInvitationsApi.respond(invitation.id, false);
      }
      if (owner !== generation.current) return;
      handled.current.add(invitation.id);
      setItems(previous => previous.filter(item => item.id !== invitation.id));
    } catch (error) {
      if (owner === generation.current && latest.current.invitationId === invitation.id) setError(error instanceof Error ? error.message : 'Unable to join this room.');
    }
    finally { if (owner === generation.current) { responding.current = false; setBusy(false); } }
  };
  if (!session || !invitation) return null;
  return <Modal layer="game" isOpen onClose={() => { if (!responding.current) void respond(false); }} title="Private Room Invitation">
    <p className="text-sm"><strong>{invitation.senderName}</strong> invited you to play <strong>{GAME_BY_ID.get(invitation.gameId)?.name || invitation.gameId}</strong>.</p>
    <p className="mt-3 text-sm">Room: <strong className="font-mono">{invitation.code}</strong> · Entry stake: <strong>{invitation.stake} coins</strong></p>
    <p className="mt-2 text-xs text-slate-500">The invitation lasts five minutes. Joining uses this room’s entry stake; the normal game-start rules still apply.</p>
    {(occupied || inGame) && <p className="mt-3 text-sm text-amber-500">Leave your current game or room before accepting.</p>}
    {socketStatus !== 'connected' && <p role="status" className="mt-3 text-sm">Connecting…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-500">{error}</p>}
    <div className="mt-5 flex justify-end gap-3">
      <button disabled={busy} onClick={() => void respond(false)} className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-bold">Decline</button>
      <button disabled={busy || occupied || inGame || socketStatus !== 'connected'} onClick={() => void respond(true)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Please wait…' : 'Accept & Join'}</button>
    </div>
  </Modal>;
}
