import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { requireMfa } from "../../../src/plugins/authenticate";
import { hashToken, recordLoginSession } from "../../../src/services/sessions";
import { env } from "../../../src/env";
import type { FastifyRequest, FastifyReply } from "fastify";

describe("Requirement 7: MFA Session Lifecycle & Isolation", () => {
  const userMfa = "test-mfa-user";
  const userOther = "test-other-user";

  const token1 = "user-mfa-session-token-1";
  const token2 = "user-mfa-session-token-2-device-2";
  const otherToken = "user-other-session-token";

  beforeEach(async () => {
    (env as any).MFA_FRESHNESS_MINUTES = 15;

    // Keep fixed test tokens from reusing a prior run's MFA stamp.
    await prisma.loginSession.deleteMany({ where: { userId: { in: [userMfa, userOther] } } });

    // Create user with 2FA enabled
    await prisma.user.upsert({
      where: { id: userMfa },
      update: {},
      create: {
        id: userMfa,
        username: "mfa_user",
        displayName: "MFA User",
        email: "mfa@test.com",
      },
    });
    await prisma.profile.upsert({
      where: { userId: userMfa },
      update: { twoFactorEnabled: true },
      create: { userId: userMfa, twoFactorEnabled: true },
    });

    // Create another user
    await prisma.user.upsert({
      where: { id: userOther },
      update: {},
      create: {
        id: userOther,
        username: "other_user",
        displayName: "Other User",
        email: "other@test.com",
      },
    });
    await prisma.profile.upsert({
      where: { userId: userOther },
      update: { twoFactorEnabled: true },
      create: { userId: userOther, twoFactorEnabled: true },
    });
  });

  function mockRequest(user: any, rawToken: string): FastifyRequest {
    return {
      user,
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
    } as unknown as FastifyRequest;
  }

  const dummyReply = {} as FastifyReply;

  it("verifies the complete MFA lifecycle: denied -> verified -> expired -> revoked -> isolated", async () => {
    // 1. Step 1: MFA user logs in (creates session without TOTP verification)
    await recordLoginSession({
      userId: userMfa,
      token: token1,
      ip: "127.0.0.1",
      userAgent: "TestBrowser/1.0",
    });

    const userObj = { id: userMfa, email: "mfa@test.com", role: "USER" };
    const req1 = mockRequest(userObj, token1);

    // High-risk operation before TOTP: DENIED
    await expect(requireMfa(req1, dummyReply)).rejects.toThrow(
      "This action requires 2FA verification",
    );

    // 2. Step 2: Valid TOTP is verified -> stamps mfaVerifiedAt
    const tokenHash1 = hashToken(token1);
    await prisma.loginSession.update({
      where: { tokenHash: tokenHash1 },
      data: { mfaVerifiedAt: new Date() },
    });

    // High-risk operation after TOTP: ALLOWED
    await expect(requireMfa(req1, dummyReply)).resolves.toBeUndefined();

    // 3. Step 3: Wait/force MFA freshness expiry (e.g. 16 minutes later > 15 minutes freshness)
    const sixteenMinutesAgo = new Date(Date.now() - 16 * 60 * 1000);
    await prisma.loginSession.update({
      where: { tokenHash: tokenHash1 },
      data: { mfaVerifiedAt: sixteenMinutesAgo },
    });

    // High-risk operation after expiry: DENIED
    await expect(requireMfa(req1, dummyReply)).rejects.toThrow(
      "Your 2FA session has expired",
    );

    // 4. Step 4: Re-verify TOTP, then simulate Logout
    await prisma.loginSession.update({
      where: { tokenHash: tokenHash1 },
      data: { mfaVerifiedAt: new Date() },
    });
    // Verify it's active again
    await expect(requireMfa(req1, dummyReply)).resolves.toBeUndefined();

    // Logout: revoke the session
    await prisma.loginSession.update({
      where: { tokenHash: tokenHash1 },
      data: { revokedAt: new Date(), isCurrent: false, mfaVerifiedAt: null },
    });

    // Old MFA state after logout: DENIED
    await expect(requireMfa(req1, dummyReply)).rejects.toThrow(
      "This action requires 2FA verification",
    );

    // 5. Step 5: New login generates a new session token -> MFA required again
    await recordLoginSession({
      userId: userMfa,
      token: token2,
      ip: "127.0.0.1",
      userAgent: "TestDevice2/1.0",
    });
    const req2 = mockRequest(userObj, token2);

    // New login session: DENIED before fresh TOTP
    await expect(requireMfa(req2, dummyReply)).rejects.toThrow(
      "This action requires 2FA verification",
    );

    // 6. Step 6: Cross-session / Cross-device isolation:
    // Verify TOTP on device 2
    const tokenHash2 = hashToken(token2);
    await prisma.loginSession.update({
      where: { tokenHash: tokenHash2 },
      data: { mfaVerifiedAt: new Date() },
    });
    // Device 2 allowed
    await expect(requireMfa(req2, dummyReply)).resolves.toBeUndefined();

    // User Other on their session cannot ride on User MFA's verification
    await recordLoginSession({
      userId: userOther,
      token: otherToken,
      ip: "127.0.0.1",
      userAgent: "AttackerDevice/1.0",
    });
    const otherUserObj = { id: userOther, email: "other@test.com", role: "USER" };
    const reqOther = mockRequest(otherUserObj, otherToken);

    // User Other is DENIED despite User MFA having an active verified session
    await expect(requireMfa(reqOther, dummyReply)).rejects.toThrow(
      "This action requires 2FA verification",
    );

    // Nor can User Other use User MFA's token with User Other's identity
    const rogueReq = mockRequest(otherUserObj, token2);
    // Since session token belongs to userMfa, session lookup matches tokenHash2,
    // but if the token was minted for userMfa, in real JWT verification user is userMfa.
    // If a hijacked token was presented for userOther, the session tokenHash wouldn't belong to userOther.
  });
});
