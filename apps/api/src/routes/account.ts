import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser } from "../lib/http";
import { auditFromRequest } from "../services/audit";

const EXPORT_RATE_LIMIT = { max: 20, timeWindow: "1 minute" };
const DELETE_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

export async function accountRoutes(app: FastifyInstance) {
  // GDPR: data subject access request. Returns all personal data we hold.
  app.get(
    "/api/account/export",
    { preHandler: authenticate, config: { rateLimit: EXPORT_RATE_LIMIT } },
    async (request) => {
      const user = requireUser(request);
      const data = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          profile: true,
          wallet: true,
          walletTransactions: {
            orderBy: { createdAt: "desc" },
            take: 500,
          },
          playerStatistics: true,
          leaderboards: true,
          friendsRequested: true,
          friendsReceived: true,
          notifications: true,
          userAchievements: { include: { achievement: true } },
          matchPlayers: true,
        },
      });

      if (!data) {
        throw new AppError("NOT_FOUND", "User not found", 404);
      }

      auditFromRequest(request, {
        actorType: "user",
        actorId: user.id,
        action: "account.exported",
        category: "account",
        targetType: "user",
        targetId: user.id,
      });

      return {
        generatedAt: new Date().toISOString(),
        data,
      };
    },
  );

  // GDPR: right to erasure. Soft-delete + anonymize so no personal data
  // remains identifiable, while preserving referential integrity and the
  // option to restore (rollback) if required.
  app.delete(
    "/api/account",
    { preHandler: authenticate, config: { rateLimit: DELETE_RATE_LIMIT } },
    async (request) => {
      const user = requireUser(request);
      const suffix = randomUUID().slice(0, 8);
      const deletedAt = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            deletedAt,
            email: `deleted-${suffix}@deleted.invalid`,
            username: `deleted_${suffix}`,
            displayName: "Deleted User",
            avatarUrl: null,
            isOnline: false,
          },
        });
      });

      auditFromRequest(request, {
        actorType: "user",
        actorId: user.id,
        action: "account.deleted",
        category: "account",
        targetType: "user",
        targetId: user.id,
      });

      return { ok: true, deletedAt: deletedAt.toISOString() };
    },
  );
}
