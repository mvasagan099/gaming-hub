import type { FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";
import { AppError, respondFriendRequestSchema, sendFriendRequestSchema } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, parseSchema, routeParams } from "../lib/http";
import { assertFeatureEnabled } from "../services/featureFlags";
import { toPublicProfile } from "../services/users";
import { checkAndUnlock } from "../services/achievements";

import { getPrivacySettings } from "../services/privacyService";

export async function friendsRoutes(app: FastifyInstance) {
  app.get("/api/friends", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("social.friends", "Friends");
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
    await assertFeatureEnabled("social.friends", "Friends");
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

  app.get("/api/friends/status/:targetId", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("social.friends", "Friends");
    const { targetId } = routeParams(request);
    if (!targetId || targetId === user.id) return { status: "SELF" };

    const targetUser = await prisma.user.findFirst({
      where: { OR: [{ id: targetId }, { username: targetId }] },
      select: { id: true },
    });
    const targetUserId = targetUser?.id ?? targetId;

    const rel = await prisma.friend.findFirst({
      where: {
        OR: [
          { requesterId: user.id, addresseeId: targetUserId },
          { requesterId: targetUserId, addresseeId: user.id },
        ],
      },
    });

    if (!rel) return { status: "NONE" };
    if (rel.status === "ACCEPTED") return { status: "FRIENDS", friendshipId: rel.id };
    if (rel.status === "PENDING") {
      if (rel.requesterId === user.id) {
        return { status: "REQUEST_SENT", requestId: rel.id };
      } else {
        return { status: "REQUEST_RECEIVED", requestId: rel.id };
      }
    }
    return { status: "NONE" };
  });

  app.post("/api/friends/request", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("social.friends", "Friends");
    const { username } = parseSchema(sendFriendRequestSchema, request.body);

    const target = await prisma.user.findUnique({ where: { username } });
    if (!target) {
      throw new AppError("NOT_FOUND", "User not found", 404);
    }
    if (target.id === user.id) {
      throw new AppError("VALIDATION_ERROR", "You cannot add yourself", 422);
    }

    const targetPrivacy = await getPrivacySettings(target.id);
    if (!targetPrivacy.allowFriendRequests) {
      throw new AppError("FRIEND_REQUESTS_DISABLED", "This user is not accepting friend requests", 403);
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
    await assertFeatureEnabled("social.friends", "Friends");
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

    // Evaluate social achievements for both sides of the new friendship.
    await Promise.all([
      countAcceptedFriends(rel.requesterId).then((count) =>
        checkAndUnlock(rel.requesterId, { userId: rel.requesterId, friendsCount: count }),
      ),
      countAcceptedFriends(rel.addresseeId).then((count) =>
        checkAndUnlock(rel.addresseeId, { userId: rel.addresseeId, friendsCount: count }),
      ),
    ]);

    return { ok: true, friend: requester ? toPublicProfile(requester) : null };
  });

  app.delete("/api/friends/:friendId", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("social.friends", "Friends");
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

async function countAcceptedFriends(userId: string): Promise<number> {
  return prisma.friend.count({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
  });
}
