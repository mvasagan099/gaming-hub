import type { Socket } from "socket.io";
import type { MultiplayerFramework } from "@gaming-hub/multiplayer";
import { AppError } from "@gaming-hub/shared";
import type { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketErrorPayload } from "@gaming-hub/socket";

type RoomSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents>;
type ErrorAck = (response: { ok: false; error: SocketErrorPayload }) => void;

/** Register the authenticated connection's room lifecycle with the shared guards. */
export function registerRoomLifecycleHandlers(
  socket: RoomSocket,
  framework: MultiplayerFramework,
  userId: string,
  guard: (ack: ErrorAck | undefined, task: () => Promise<void>) => Promise<void>,
  assertFeatureEnabled: (flag: string, label: string) => Promise<void>,
  onJoin?: (roomId: string) => void,
): void {
  socket.on("room:create", (payload, ack) =>
    void guard(ack, async () => {
      await assertFeatureEnabled("games.enabled", "Games");
      if (payload.stake > 0) {
        await assertFeatureEnabled("games.realMoney", "Real-money play");
      } else {
        await assertFeatureEnabled("games.practice", "Practice mode");
      }

      // Remove from matchmaking if in queue
      framework.matchmakingManager.removeFromQueue(userId);

      const room = await framework.roomManager.createRoom({
        gameId: payload.gameId,
        hostId: userId,
        hostSocket: socket,
        isPrivate: payload.isPrivate,
        stake: payload.stake,
        maxPlayers: payload.maxPlayers ?? 4,
        settings: payload.settings,
      });

      ack?.({ ok: true, data: framework.syncManager.serializeRoom(room) });
    }),
  );

  socket.on("room:join", (payload, ack) =>
    void guard(ack, async () => {
      await assertFeatureEnabled("games.enabled", "Games");
      if (payload.asSpectator) {
        await assertFeatureEnabled("games.spectator", "Spectator mode");
      }

      // Remove from matchmaking if in queue
      framework.matchmakingManager.removeFromQueue(userId);

      const room = await framework.roomManager.joinRoom({
        roomId: payload.roomId,
        code: payload.code,
        playerId: userId,
        socket,
        asSpectator: payload.asSpectator,
      });

      onJoin?.(room.id);

      ack?.({ ok: true, data: framework.syncManager.serializeRoom(room) });
    }),
  );

  socket.on("room:ready", (payload, ack) =>
    void guard(ack, async () => {
      await framework.roomManager.setPlayerReady(payload.roomId, userId, payload.ready);
      const room = framework.roomManager.getRoom(payload.roomId);
      if (!room) throw new AppError("ROOM_NOT_FOUND", "Room not found");
      ack?.({ ok: true, data: framework.syncManager.serializeRoom(room) });
    }),
  );

  socket.on("room:start", (payload, ack) =>
    void guard(ack, async () => {
      await assertFeatureEnabled("games.enabled", "Games");
      await framework.matchManager.startMatch({
        roomId: payload.roomId,
        startedBy: userId,
      });
      const room = framework.roomManager.getRoom(payload.roomId);
      if (!room) throw new AppError("ROOM_NOT_FOUND", "Room not found");
      ack?.({ ok: true, data: framework.syncManager.serializeRoom(room) });
    }),
  );
}
