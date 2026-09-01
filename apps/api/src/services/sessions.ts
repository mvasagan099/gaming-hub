import { createHash } from "node:crypto";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function deviceNameFromUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent;
  if (/mobile|android|iphone/i.test(ua)) return "Mobile";
  if (/tablet|ipad/i.test(ua)) return "Tablet";
  if (/windows/i.test(ua)) return "Windows PC";
  if (/mac/i.test(ua)) return "Mac";
  if (/linux/i.test(ua)) return "Linux";
  return "Desktop";
}

export function browserFromUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent;
  if (/edg/i.test(ua)) return "Microsoft Edge";
  if (/opr|opera/i.test(ua)) return "Opera";
  if (/chrome/i.test(ua)) return "Google Chrome";
  if (/firefox/i.test(ua)) return "Mozilla Firefox";
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "Apple Safari";
  return "Unknown Browser";
}

export async function recordLoginSession(input: {
  userId: string;
  token: string;
  ip: string | null;
  userAgent: string | null;
}) {
  const tokenHash = hashToken(input.token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  return prisma.$transaction(async (tx) => {
    // 0. Take an exclusive row lock on the User row to serialize concurrent login attempts
    await tx.user.update({
      where: { id: input.userId },
      data: { updatedAt: now },
    });

    // 1. Atomically revoke ALL other existing active sessions for this user
    await tx.loginSession.updateMany({
      where: {
        userId: input.userId,
        revokedAt: null,
        NOT: { tokenHash },
      },
      data: {
        revokedAt: now,
        isCurrent: false,
      },
    });


    // 2. Prune old stale/expired sessions beyond the recent history to keep table lean
    const stale = await tx.loginSession.findMany({
      where: {
        userId: input.userId,
        OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: now } }],
        NOT: { tokenHash },
      },
      orderBy: { createdAt: "desc" },
      skip: 20,
      select: { id: true },
    });
    if (stale.length > 0) {
      await tx.loginSession.deleteMany({
        where: { id: { in: stale.map((s) => s.id) } },
      });
    }

    // 3. Upsert the current session as the ONLY active session
    const existing = await tx.loginSession.findUnique({ where: { tokenHash } });
    if (existing) {
      return tx.loginSession.update({
        where: { id: existing.id },
        data: {
          isCurrent: true,
          revokedAt: null,
          expiresAt,
          ip: input.ip ?? existing.ip,
          userAgent: input.userAgent ?? existing.userAgent,
          deviceName: deviceNameFromUserAgent(input.userAgent) ?? existing.deviceName,
        },
      });
    }

    return tx.loginSession.create({
      data: {
        userId: input.userId,
        tokenHash,
        ip: input.ip,
        userAgent: input.userAgent,
        deviceName: deviceNameFromUserAgent(input.userAgent),
        isCurrent: true,
        expiresAt,
      },
    });
  });
}

export async function listSessions(userId: string, currentTokenHash?: string) {
  const now = new Date();
  const rows = await prisma.loginSession.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return rows.map((s) => ({
    id: s.id,
    ip: s.ip || "127.0.0.1",
    userAgent: s.userAgent,
    deviceName: s.deviceName || deviceNameFromUserAgent(s.userAgent) || "Windows PC",
    browserName: browserFromUserAgent(s.userAgent) || "Google Chrome",
    isCurrent: currentTokenHash ? s.tokenHash === currentTokenHash : s.isCurrent,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    revokedAt: s.revokedAt ? s.revokedAt.toISOString() : null,
  }));
}

export async function revokeSession(userId: string, sessionId: string, currentTokenHash?: string) {
  const session = await prisma.loginSession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) {
    throw new AppError("NOT_FOUND", "Session not found", 404);
  }
  if (currentTokenHash && session.tokenHash === currentTokenHash) {
    throw new AppError("VALIDATION_ERROR", "You cannot revoke the session you are using", 422);
  }
  return prisma.loginSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date(), isCurrent: false },
  });
}

export async function revokeOtherSessions(userId: string, currentTokenHash: string) {
  const result = await prisma.loginSession.updateMany({
    where: { userId, revokedAt: null, NOT: { tokenHash: currentTokenHash } },
    data: { revokedAt: new Date(), isCurrent: false },
  });
  return { ok: true, revoked: result.count };
}

