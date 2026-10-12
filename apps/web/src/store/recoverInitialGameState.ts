import { useMultiplayerStore } from './multiplayerStore';

// Readiness-gated games do not tick until both boards load. Recover a missed
// initial snapshot without pretending the board is ready or restarting a match.
export function recoverInitialGameState(roomId: string, matchId: string): () => void {
  let cancelled = false;
  let pending = false;
  const deadline = Date.now() + 30_000;
  const retry = () => {
    const state = useMultiplayerStore.getState();
    if (cancelled || Date.now() >= deadline || state.room?.id !== roomId
      || state.room.matchId !== matchId || state.room.status !== 'playing'
      || (state.matchId === matchId && state.gameState)) {
      clearInterval(timer);
      return;
    }
    if (pending || state.status !== 'connected') return;
    pending = true;
    void state.requestFullStateSync(matchId).catch(() => undefined).finally(() => { pending = false; });
  };
  const timer = setInterval(retry, 3_000);
  retry();
  return () => { cancelled = true; clearInterval(timer); };
}
