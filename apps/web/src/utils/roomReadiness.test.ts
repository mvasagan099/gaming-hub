import { describe, expect, it } from 'vitest';
import type { RoomFull } from '@gaming-hub/shared';
import { canChangeRoomReady } from './roomReadiness';

describe('private room readiness after countdown interruption', () => {
  it('enables readiness after reconnect, then disables it when countdown resumes', () => {
    const room = { status: 'starting', lifecyclePhase: 'COUNTDOWN' } as RoomFull;
    expect(canChangeRoomReady(room)).toBe(false);
    room.lifecyclePhase = 'READY_CHECK';
    expect(canChangeRoomReady(room)).toBe(true);
    room.lifecyclePhase = 'COUNTDOWN';
    expect(canChangeRoomReady(room)).toBe(false);
    room.status = 'playing'; room.lifecyclePhase = 'READY_CHECK';
    expect(canChangeRoomReady(room)).toBe(false); // Board loading is a separate receipt.
  });

  it('allows lobby readiness and prevents it without a room or after game end', () => {
    expect(canChangeRoomReady(null)).toBe(false);
    expect(canChangeRoomReady({ status: 'waiting' } as RoomFull)).toBe(true);
    expect(canChangeRoomReady({ status: 'ended', lifecyclePhase: 'READY_CHECK' } as RoomFull)).toBe(false);
  });
});
