import { createHash } from "node:crypto";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Self-service logout only: never changes passwords or grants recovery/MFA access. */
export async function revokeAllSessions(userId: string, token: string, providerSessionId?: string, tokenExpiresAt?: Date) {
  return prisma.$transaction(async tx => {
    const now = new Date();
    await tx.user.update({ where: { id: userId }, data: { updatedAt: now } });
    const tokenHash = hashToken(token);
    const existing = await tx.loginSession.findUnique({ where: { tokenHash } });
    if (existing && existing.userId !== userId) throw new AppError('UNAUTHORIZED', 'Invalid session owner', 401);
    // A replay must not log out a later legitimate login.
    if (existing?.revokedAt) return { ok: true };
    if (!existing && providerSessionId) {
      const prior = await tx.loginSession.findFirst({ where: { userId, providerSessionId }, orderBy: [{ isCurrent: 'desc' }, { createdAt: 'desc' }] });
      if (prior?.revokedAt) return { ok: true };
    }
    if (!existing) await tx.loginSession.create({ data: {
      userId, tokenHash, providerSessionId: providerSessionId ?? null,
      expiresAt: new Date(Math.max(now.getTime() + SESSION_TTL_MS, tokenExpiresAt?.getTime() ?? 0)),
      revokedAt: now, isCurrent: false, mfaVerifiedAt: null,
    } });
    await tx.loginSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now, isCurrent: false, mfaVerifiedAt: null } });
    return { ok: true };
  });
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
  /** Expiration from a verified provider token, never from client input. */
  expiresAt?: Date;
  providerSessionId?: string;
}) {
  const tokenHash = hashToken(input.token);
  const now = new Date();
  if (input.expiresAt && input.expiresAt <= now) throw new AppError("SESSION_REVOKED", "Session has expired", 401);
  // Retain tombstones for the application session lifetime AND token validity.
  const expiresAt = new Date(Math.max(now.getTime() + SESSION_TTL_MS, input.expiresAt?.getTime() ?? 0));

  return prisma.$transaction(async (tx) => {
    // 0. Take an exclusive row lock on the User row to serialize concurrent login attempts
    await tx.user.update({
      where: { id: input.userId },
      data: { updatedAt: now },
    });

    const existing = await tx.loginSession.findUnique({ where: { tokenHash } });
    if (existing && (existing.userId !== input.userId || existing.revokedAt || existing.expiresAt <= now)) {
      throw new AppError("SESSION_REVOKED", "Session has been revoked or expired", 401);
    }
    const providerSession = !existing && input.providerSessionId
      ? await tx.loginSession.findFirst({
          where: { userId: input.userId, providerSessionId: input.providerSessionId },
          orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }],
        }) : null;
    if (providerSession && (providerSession.revokedAt || providerSession.expiresAt <= now)) {
      throw new AppError("SESSION_REVOKED", "Provider session has been revoked or expired", 401);
    }

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
        // Revocation tombstones must outlive the credential they invalidate.
        expiresAt: { lt: now },
        // Provider identities stay revoked across token refresh. They are retained
        // until explicit account retention cleanup, not pruned during login.
        providerSessionId: null,
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
    if (existing) {
      return tx.loginSession.update({
        where: { id: existing.id },
        data: {
          isCurrent: true,
          ip: input.ip ?? existing.ip,
          userAgent: input.userAgent ?? existing.userAgent,
          deviceName: deviceNameFromUserAgent(input.userAgent) ?? existing.deviceName,
          ...(input.providerSessionId && !existing.providerSessionId ? { providerSessionId: input.providerSessionId } : {}),
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
        expiresAt: providerSession?.expiresAt ?? expiresAt,
        providerSessionId: input.providerSessionId ?? null,
        mfaVerifiedAt: providerSession?.mfaVerifiedAt ?? null,
      },
    });
  });
}

export async function revokeCurrentSession(userId: string, token: string, verifiedProviderSessionId?: string, tokenExpiresAt?: Date) {
  return prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { updatedAt: new Date() } });
    const session = await tx.loginSession.findUnique({ where: { tokenHash: hashToken(token) } });
    if (session && session.userId !== userId) return { count: 0 };
    const providerSessionId = session?.providerSessionId ?? verifiedProviderSessionId;
    if (!session) {
      await tx.loginSession.create({ data: {
        userId, tokenHash: hashToken(token), providerSessionId: providerSessionId ?? null,
        expiresAt: new Date(Math.max(Date.now() + SESSION_TTL_MS, tokenExpiresAt?.getTime() ?? 0)),
        revokedAt: new Date(), isCurrent: false,
      } });
    } else if (providerSessionId && !session.providerSessionId) {
      await tx.loginSession.update({ where: { id: session.id }, data: { providerSessionId } });
    }
    return tx.loginSession.updateMany({
      where: { userId, ...(providerSessionId ? { providerSessionId } : { tokenHash: hashToken(token) }), revokedAt: null },
      data: { revokedAt: new Date(), isCurrent: false, mfaVerifiedAt: null },
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
  return prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { updatedAt: new Date() } });
    const session = await tx.loginSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) {
      throw new AppError("NOT_FOUND", "Session not found", 404);
    }
    if (currentTokenHash && session.tokenHash === currentTokenHash) {
      throw new AppError("VALIDATION_ERROR", "You cannot revoke the session you are using", 422);
    }
    return tx.loginSession.updateMany({
      where: { userId, ...(session.providerSessionId ? { providerSessionId: session.providerSessionId } : { id: sessionId }) },
      data: { revokedAt: new Date(), isCurrent: false },
    });
  });
}

export async function revokeOtherSessions(userId: string, currentTokenHash: string) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { updatedAt: new Date() } });
    return tx.loginSession.updateMany({
      where: { userId, revokedAt: null, NOT: { tokenHash: currentTokenHash } },
      data: { revokedAt: new Date(), isCurrent: false },
    });
  });
  return { ok: true, revoked: result.count };
}
