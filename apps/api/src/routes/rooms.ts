import type { FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { routeParams } from "../lib/http";

export async function roomsRoutes(app: FastifyInstance) {
  app.get("/api/rooms/code/:code", { preHandler: authenticate }, async (request) => {
    const { code: codeParam } = routeParams(request);
    const code = codeParam.toUpperCase().trim();
    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        host: { include: { profile: true } },
        players: { include: { user: { include: { profile: true } } } },
      },
    });

    if (!room || room.status === "ENDED") {
      throw new AppError("ROOM_NOT_FOUND", "Room not found", 404);
    }

    return {
      id: room.id,
      code: room.code,
      gameId: room.gameId,
      hostName: room.host.displayName,
      status: room.status,
      isPrivate: room.isPrivate,
      stake: room.stake,
      minPlayers: room.minPlayers,
      maxPlayers: room.maxPlayers,
      playerCount: room.players.filter((p) => !p.isSpectator).length,
      spectatorCount: room.players.filter((p) => p.isSpectator).length,
    };
  });

  app.get("/api/rooms/:id", { preHandler: authenticate }, async (request) => {
    const { id } = routeParams(request);
    const room = await prisma.room.findUnique({
      where: { id },
      include: { players: { include: { user: { include: { profile: true } } } } },
    });
    if (!room) {
      throw new AppError("ROOM_NOT_FOUND", "Room not found", 404);
    }
    return room;
  });
}
