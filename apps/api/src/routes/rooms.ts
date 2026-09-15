import type { FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { routeParams } from "../lib/http";

// ─── Safe public user select ──────────────────────────────────────────────────
// Only these fields are exposed to other users. Never return passwordHash,
// twoFactorSecret, phone, dateOfBirth, address, or any other PII.
const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  role: true,
  profile: {
    select: {
      level: true,
      xp: true,
      wins: true,
      losses: true,
    } as const,
  },
} as const;

export async function roomsRoutes(app: FastifyInstance) {
  app.get("/api/rooms/code/:code", { preHandler: authenticate }, async (request) => {
    const { code: codeParam } = routeParams(request);
    const code = codeParam.toUpperCase().trim();
    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        host: { select: { displayName: true } },
        players: {
          select: {
            id: true,
            isSpectator: true,
            isReady: true,
            seat: true,
            user: { select: PUBLIC_USER_SELECT },
          },
        },
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
    // C-01 fix: verify the requesting user is a participant or the host
    const requestingUserId = (request as any).user?.id as string | undefined;

    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        players: {
          select: {
            id: true,
            isSpectator: true,
            isReady: true,
            seat: true,
            connectionStatus: true,
            user: { select: PUBLIC_USER_SELECT },
          },
        },
      },
    });

    if (!room) {
      throw new AppError("ROOM_NOT_FOUND", "Room not found", 404);
    }

    // Membership check: requester must be host or a player in the room
    const isMember =
      room.hostId === requestingUserId ||
      room.players.some((p) => p.user.id === requestingUserId);

    if (!isMember) {
      // Return 404 to avoid leaking room existence to non-members
      throw new AppError("ROOM_NOT_FOUND", "Room not found", 404);
    }

    return {
      id: room.id,
      code: room.code,
      gameId: room.gameId,
      hostId: room.hostId,
      status: room.status,
      isPrivate: room.isPrivate,
      stake: room.stake,
      minPlayers: room.minPlayers,
      maxPlayers: room.maxPlayers,
      players: room.players,
    };
  });
}
