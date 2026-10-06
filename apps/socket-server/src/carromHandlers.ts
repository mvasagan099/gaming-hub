import type { Server, Socket } from "socket.io";
import type { MultiplayerFramework } from "@gaming-hub/multiplayer";
import { type CarromEngine, isValidStrikerPlacement } from "@gaming-hub/game-engine";

/** Visual previews never mutate the authoritative striker or advance a turn. */
export function registerCarromPreviewHandler(
  socket: Socket, io: Server, framework: MultiplayerFramework, userId: string,
): void {
  let lastScope: string | null = null;
  let lastSequence = -1;
  socket.on("carrom:striker-position", payload => {
    if (!payload || typeof payload !== "object") return;
    const roomId = payload.roomId || (payload.matchId ? framework.roomManager.getPlayerRoom(userId)?.id : undefined);
    if (!roomId) return;
    const room = framework.roomManager.getRoom(roomId);
    if (!room || room.config.gameId !== "carrom" || room.status !== "playing" || !room.match) return;
    if (payload.matchId && payload.matchId !== room.match.matchId) return;
    const player = room.players.get(userId);
    if (!player || player.isSpectator || player.seat === null) return;
    const state = (room.match.engine as CarromEngine).state;
    if (!state || state.finished || state.isShotInProgress || state.currentSeat !== player.seat) return;
    const turn = state.turnNumber ?? 0;
    if (payload.turnNumber !== undefined && payload.turnNumber !== turn) return;
    if (!Number.isSafeInteger(payload.sequence) || payload.sequence < 0) return;
    if (!Number.isFinite(payload.x) || !isValidStrikerPlacement(payload.x, player.seat, state.coins)) return;
    const scope = `${room.match.matchId}:${turn}`;
    if (lastScope === scope && payload.sequence <= lastSequence) return;
    lastScope = scope;
    lastSequence = payload.sequence;
    io.to(room.ioName).emit("carrom:striker-position", {
      roomId: room.id, matchId: room.match.matchId, playerId: userId,
      seat: player.seat, turnNumber: turn, x: payload.x,
      sequence: payload.sequence, timestamp: Date.now(),
    });
  });
}
