import type { RoomFull } from '@gaming-hub/shared';

export function canChangeRoomReady(room: RoomFull | null): boolean {
  return !!room && (room.status === 'waiting' ||
    (room.status === 'starting' && room.lifecyclePhase === 'READY_CHECK'));
}
