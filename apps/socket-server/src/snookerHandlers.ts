import type { Server, Socket } from "socket.io";
import type { MultiplayerFramework } from "@gaming-hub/multiplayer";
import type { SnookerEngine } from "@gaming-hub/game-engine";

export function registerSnookerPreviewHandler(socket: Socket, io: Server, framework: MultiplayerFramework, userId: string): void {
  let scope: string | null = null;
  let sequence = -1;
  socket.on("snooker:aim-position", payload => {
    if (!payload || typeof payload !== "object") return;
    const room = framework.roomManager.getRoom(payload.roomId);
    if (!room || room.config.gameId !== "snooker" || room.status !== "playing" || !room.match) return;
    if (payload.matchId !== room.match.matchId) return;
    const player = room.players.get(userId);
    const state = (room.match.engine as SnookerEngine).state;
    if (!player || player.isSpectator || player.seat === null || state.finished || state.paused || state.currentSeat !== player.seat) return;
    if (["FRAME_END", "MATCH_END"].includes(state.frameStatus) || (state.shotPlaybackEndsAtMs ?? 0) > Date.now()) return;
    if (payload.turnNumber !== state.turnNumber || !Number.isSafeInteger(payload.sequence) || payload.sequence < 0) return;
    if (![payload.angle, payload.power].every(Number.isFinite)) return;
    const nextScope = `${room.match.matchId}:${state.turnNumber}`;
    if (scope === nextScope && payload.sequence <= sequence) return;
    scope = nextScope; sequence = payload.sequence;
    io.to(room.ioName).emit("snooker:aim-position", {
      roomId: room.id, matchId: room.match.matchId, turnNumber: state.turnNumber,
      playerId: userId, seat: player.seat, angle: payload.angle,
      power: Math.max(0.05, Math.min(1, payload.power)), sequence, timestamp: Date.now(),
    });
  });
}
