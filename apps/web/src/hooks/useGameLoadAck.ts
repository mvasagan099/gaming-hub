import { useEffect } from 'react';
import { useMultiplayerStore } from '../store/multiplayerStore';

/** Mounted board + authoritative state, distinct from the lobby's Ready button. */
export function useGameLoadAck(gameId: string, mode: string, boardRendered: boolean): void {
  const roomId = useMultiplayerStore(s => s.room?.id);
  const matchId = useMultiplayerStore(s => s.matchId);
  const loading = useMultiplayerStore(s => s.room?.gameId === gameId && !!s.room.awaitingGameLoad);
  const hasState = useMultiplayerStore(s => !!s.gameState);
  const socket = useMultiplayerStore(s => s.socket);
  const connected = useMultiplayerStore(s => s.status === 'connected');
  useEffect(() => {
    if (!boardRendered || mode !== 'multiplayer' || !loading || !hasState || !connected || !socket || !roomId || !matchId) return;
    let active = true, pending = false;
    const acknowledge = async () => {
      if (!active || pending) return;
      pending = true;
      try { await socket.timeout(3000).emitWithAck('game:loaded', { roomId, matchId }); }
      catch { /* A lost acknowledgement is retried with the same match identity. */ }
      finally { pending = false; }
    };
    void acknowledge();
    const timer = setInterval(() => { void acknowledge(); }, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [mode, boardRendered, loading, hasState, connected, socket, roomId, matchId]);
}
