import { createHash } from "node:crypto";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Parse a rough device label from a User-Agent string for the devices list. */
export function deviceNameFromUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent;
  if (/mobile|android|iphone/i.test(ua)) return "Mobile";
  if (/tablet|ipad/i.test(ua)) return "Tablet";
  return "Desktop";
}

export async function recordLoginSession(input: {
  userId: string;
  token: string;
  ip: string | null;
  userAgent: string | null;
}) {
  // Cap the number of tracked sessions per user to avoid unbounded growth;
  // the oldest expired/revoked rows are pruned first.
  const stale = await prisma.loginSession.findMany({
    where: {
      userId: input.userId,
      OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.loginSession.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });
  }

  const tokenHash = hashToken(input.token);
  const existing = await prisma.loginSession.findUnique({ where: { tokenHash } });
  if (existing) {
    // Same token re-exchanged: refresh instead of duplicating.
    return prisma.loginSession.update({
      where: { id: existing.id },
      data: {
        isCurrent: true,
        revokedAt: null,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
  }

  return prisma.loginSession.create({
    data: {
      userId: input.userId,
      tokenHash,
      ip: input.ip,
      userAgent: input.userAgent,
      deviceName: deviceNameFromUserAgent(input.userAgent),
      isCurrent: true,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
}

export async function listSessions(userId: string) {
  const rows = await prisma.loginSession.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((s) => ({
    id: s.id,
    ip: s.ip,
    userAgent: s.userAgent,
    deviceName: s.deviceName,
    isCurrent: s.isCurrent,
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
