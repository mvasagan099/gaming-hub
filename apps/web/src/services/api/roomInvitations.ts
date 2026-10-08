import { apiClient } from './client';
import type { GameId } from '@gaming-hub/shared';
export interface RoomInvitation {
  id: string; roomId: string; code: string; gameId: GameId; stake: number;
  senderId: string; senderName: string; expiresAt: string;
}
export const roomInvitationsApi = {
  pending: () => apiClient.get<{ items: RoomInvitation[] }>('/room-invitations'),
  send: (roomId: string, friendId: string) => apiClient.post<{ sent: boolean }>('/room-invitations', { roomId, friendId }),
  resolve: (id: string) => apiClient.get<RoomInvitation>(`/room-invitations/${encodeURIComponent(id)}`),
  respond: (id: string, accepted: boolean) => apiClient.post(`/room-invitations/${encodeURIComponent(id)}/respond`, { accepted }),
};
