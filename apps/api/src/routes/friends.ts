import type { FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";
import { AppError, respondFriendRequestSchema, sendFriendRequestSchema } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, parseSchema, routeParams } from "../lib/http";
import { toPublicProfile } from "../services/users";

export async function friendsRoutes(app: FastifyInstance) {
  app.get("/api/friends", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const relationships = await prisma.friend.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: user.id }, { addresseeId: user.id }],
      },
      include: {
        requester: { include: { profile: true } },
        addressee: { include: { profile: true } },
      },
    });

    return relationships.map((rel) => {
      const other =
        rel.requesterId === user.id ? rel.addressee : rel.requester;
      return {
        id: rel.id,
        friend: toPublicProfile(other),
        createdAt: rel.createdAt.toISOString(),
      };
    });
  });

  app.get("/api/friends/requests", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const incoming = await prisma.friend.findMany({
      where: { addresseeId: user.id, status: "PENDING" },
      include: { requester: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
    });
    return incoming.map((r) => ({
      id: r.id,
      requester: toPublicProfile(r.requester),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
  });

  app.post("/api/friends/request", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { username } = parseSchema(sendFriendRequestSchema, request.body);

    const target = await prisma.user.findUnique({ where: { username } });
    if (!target) {
      throw new AppError("NOT_FOUND", "User not found", 404);
    }
    if (target.id === user.id) {
      throw new AppError("VALIDATION_ERROR", "You cannot add yourself", 422);
    }

    const existing = await prisma.friend.findFirst({
      where: {
        OR: [
          { requesterId: user.id, addresseeId: target.id },
          { requesterId: target.id, addresseeId: user.id },
        ],
      },
    });
    if (existing) {
      throw new AppError("VALIDATION_ERROR", "Friendship already exists or is pending", 422);
    }

    return prisma.friend.create({
      data: { requesterId: user.id, addresseeId: target.id },
    });
  });

  app.post("/api/friends/respond", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { requestId, accept } = parseSchema(respondFriendRequestSchema, request.body);

    const rel = await prisma.friend.findFirst({
      where: { id: requestId, addresseeId: user.id, status: "PENDING" },
    });
    if (!rel) {
      throw new AppError("NOT_FOUND", "Friend request not found", 404);
    }

    if (!accept) {
      return prisma.friend.delete({ where: { id: rel.id } });
    }

    await prisma.friend.update({
      where: { id: rel.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });

    const [requester, addressee] = await Promise.all([
      prisma.user.findUnique({ where: { id: rel.requesterId }, include: { profile: true } }),
      prisma.user.findUnique({ where: { id: rel.addresseeId }, include: { profile: true } }),
    ]);

    return { ok: true, friend: requester ? toPublicProfile(requester) : null };
  });

  app.delete("/api/friends/:friendId", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { friendId } = routeParams(request);

    const rel = await prisma.friend.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { requesterId: user.id, addresseeId: friendId },
          { requesterId: friendId, addresseeId: user.id },
        ],
      },
    });
    if (!rel) {
      throw new AppError("NOT_FOUND", "Friendship not found", 404);
    }

    await prisma.friend.delete({ where: { id: rel.id } });
    return { ok: true };
  });
}
