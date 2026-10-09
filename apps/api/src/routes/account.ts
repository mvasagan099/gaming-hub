import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { authenticate, requireMfa } from "../plugins/authenticate";
import { requireUser, routeParams } from "../lib/http";
import { auditFromRequest } from "../services/audit";
import { hashToken, listSessions, revokeOtherSessions, revokeSession } from "../services/sessions";

const EXPORT_RATE_LIMIT = { max: 20, timeWindow: "1 minute" };
const DELETE_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };
const SESSIONS_RATE_LIMIT = { max: 60, timeWindow: "1 minute" };

function currentTokenHash(request: { headers: Record<string, string | string[] | undefined> }): string {
  const header = request.headers.authorization;
  const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
  return token ? hashToken(token) : "";
}

export async function accountRoutes(app: FastifyInstance) {
  // ---- Sessions & devices --------------------------------------------------
  app.get(
    "/api/account/sessions",
    { preHandler: authenticate, config: { rateLimit: SESSIONS_RATE_LIMIT } },
    async (request) => {
      return listSessions(requireUser(request).id, currentTokenHash(request));
    },
  );

  app.delete(
    "/api/account/sessions/:id",
    { preHandler: authenticate, config: { rateLimit: SESSIONS_RATE_LIMIT } },
    async (request) => {
      const user = requireUser(request);
      const { id } = routeParams(request);
      await revokeSession(user.id, id, currentTokenHash(request));
      auditFromRequest(request, {
        actorType: "user",
        actorId: user.id,
        action: "account.session.revoked",
        category: "account",
        targetType: "session",
        targetId: id,
      });
      return { ok: true };
    },
  );

  app.delete(
    "/api/account/sessions",
    { preHandler: authenticate, config: { rateLimit: SESSIONS_RATE_LIMIT } },
    async (request) => {
      const user = requireUser(request);
      const result = await revokeOtherSessions(user.id, currentTokenHash(request));
      auditFromRequest(request, {
        actorType: "user",
        actorId: user.id,
        action: "account.sessions.revoked_others",
        category: "account",
        targetType: "user",
        targetId: user.id,
        meta: { revoked: result.revoked },
      });
      return result;
    },
  );

  // GDPR: data subject access request. Returns all personal data we hold.
  app.get(
    "/api/account/export",
    { preHandler: authenticate, config: { rateLimit: EXPORT_RATE_LIMIT } },
    async (request) => {
      const user = requireUser(request);
      const data = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          profile: {
            select: {
              bio: true, country: true, currency: true, coins: true, gems: true,
              xp: true, level: true, wins: true, losses: true, draws: true,
              premium: true, vipLevel: true, twoFactorEnabled: true,
            },
          },
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

  // Remove public/account identity while preserving restricted compliance and
  // financial history under the separately approved retention policy.
  app.delete(
    "/api/account",
    { preHandler: [authenticate, requireMfa], config: { rateLimit: DELETE_RATE_LIMIT } },
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
        await tx.profile.update({
          where: { userId: user.id },
          data: {
            bio: null, gender: null,
            phone: null, dateOfBirth: null, streetAddress: null, city: null,
            state: null, postcode: null, passwordHash: null, twoFactorSecret: null,
            twoFactorSecretEncrypted: null, twoFactorSecretKeyVersion: null,
            totpEncryptedAt: null,
          },
        });
        // Retained compliance records remain restricted to authorized KYC staff.
        // Preserve storage identities until the approved retention period expires;
        // erasing paths would make eventual removal impossible to recover.
        const retainedKyc = await tx.kycRequest.findUnique({ where: { userId: user.id } });
        if (retainedKyc) await tx.kycAuditLog.create({ data: { requestId: retainedKyc.id, actorId: user.id,
          action: 'ACCOUNT_DELETED_KYC_RETAINED', category: 'RETENTION', metadata: { accountDeletedAt: deletedAt.toISOString(), retentionPolicy: 'COMPLIANCE_PERIOD_PENDING' } } });
        await tx.loginSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: deletedAt },
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
