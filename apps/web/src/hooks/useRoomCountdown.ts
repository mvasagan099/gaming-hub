import { useEffect, useState } from 'react';
import type { RoomFull } from '@gaming-hub/shared';

/** Display only: the server's persisted deadline decides when gameplay begins. */
export function useRoomCountdown(room: RoomFull | null, legacy: number | null) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (room?.lifecyclePhase !== 'COUNTDOWN' || room.countdownEndsAt == null) { setRemaining(null); return; }
    const receivedAt = performance.now(), serverAt = room.serverTimeMs ?? Date.now();
    const update = () => setRemaining(Math.max(0, Math.ceil((room.countdownEndsAt! - serverAt - (performance.now() - receivedAt)) / 1000)));
    update(); const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [room?.lifecyclePhase, room?.countdownEndsAt, room?.serverTimeMs]);
  return room?.lifecyclePhase === 'COUNTDOWN' ? remaining : legacy;
}
