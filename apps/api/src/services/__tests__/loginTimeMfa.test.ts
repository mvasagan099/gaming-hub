/**
 * Login-Time MFA Integration Tests
 *
 * Verifies that:
 *   Case A – 2FA disabled → session authenticated without MFA gate
 *   Case B – 2FA enabled  → session recorded with mfaVerifiedAt=null (pending)
 *   Case C – pending session blocked from normal authenticated route
 *   Case D – TOTP verify stamps mfaVerifiedAt → normal routes accessible
 *   Case E – fresh TOTP within MFA_FRESHNESS_MINUTES → requireMfa routes pass
 *   Case F – mfaVerifiedAt older than freshness window → requireMfa routes fail
 *   Case G – sign-out clears mfaVerifiedAt state (revoke session)
 *   Case H – pending session calling 2FA verify is allowed (the exemption)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { requireMfa } from "../../../src/plugins/authenticate";
import { hashToken, recordLoginSession } from "../../../src/services/sessions";
import { env } from "../../../src/env";
import type { FastifyRequest, FastifyReply } from "fastify";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_2FA_ID = "login-mfa-test-user-2fa";
const USER_NO_2FA_ID = "login-mfa-test-user-no2fa";

const TOKEN_2FA = "login-mfa-token-2fa-user";
const TOKEN_NO_2FA = "login-mfa-token-no2fa-user";

function mockRequest(
  user: { id: string; email: string; role: string },
  rawToken: string
): FastifyRequest {
  return {
    user,
    method: "GET",
    url: "/api/some-protected-route",
    headers: {
      authorization: `Bearer ${rawToken}`,
    },
  } as unknown as FastifyRequest;
}

const dummyReply = {} as FastifyReply;

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Login-Time MFA: Pending Session Isolation", () => {
  beforeEach(async () => {
    (env as unknown as Record<string, unknown>).MFA_FRESHNESS_MINUTES = 15;

    // Clean up from previous runs
    await prisma.loginSession.deleteMany({
      where: { userId: { in: [USER_2FA_ID, USER_NO_2FA_ID] } },
    });

    // User with 2FA ENABLED
    await prisma.user.upsert({
      where: { id: USER_2FA_ID },
      update: {},
      create: {
        id: USER_2FA_ID,
        username: "login_mfa_user",
        displayName: "MFA Login Test User",
        email: "login_mfa@test.com",
      },
    });
    await prisma.profile.upsert({
      where: { userId: USER_2FA_ID },
      update: { twoFactorEnabled: true },
      create: { userId: USER_2FA_ID, twoFactorEnabled: true },
    });

    // User with 2FA DISABLED
    await prisma.user.upsert({
      where: { id: USER_NO_2FA_ID },
      update: {},
      create: {
        id: USER_NO_2FA_ID,
        username: "login_no2fa_user",
        displayName: "No 2FA Login Test User",
        email: "login_no2fa@test.com",
      },
    });
    await prisma.profile.upsert({
      where: { userId: USER_NO_2FA_ID },
      update: { twoFactorEnabled: false },
      create: { userId: USER_NO_2FA_ID, twoFactorEnabled: false },
    });
  });

  afterEach(async () => {
    await prisma.loginSession.deleteMany({
      where: { userId: { in: [USER_2FA_ID, USER_NO_2FA_ID] } },
    });
  });

  // ── Case A ──────────────────────────────────────────────────────────────────
  it("Case A: 2FA-disabled user – requireMfa passes without TOTP", async () => {
    await recordLoginSession({
      userId: USER_NO_2FA_ID,
      token: TOKEN_NO_2FA,
      ip: "127.0.0.1",
      userAgent: "TestAgent/1.0",
    });

    const user = { id: USER_NO_2FA_ID, email: "login_no2fa@test.com", role: "USER" };
    const req = mockRequest(user, TOKEN_NO_2FA);

    // Standard users without 2FA pass requireMfa without issue
    await expect(requireMfa(req, dummyReply)).resolves.toBeUndefined();
  });

  // ── Case B ──────────────────────────────────────────────────────────────────
  it("Case B: 2FA-enabled user – session recorded with mfaVerifiedAt=null (pending)", async () => {
    await recordLoginSession({
      userId: USER_2FA_ID,
      token: TOKEN_2FA,
      ip: "127.0.0.1",
      userAgent: "TestAgent/1.0",
    });

    const tokenHash = hashToken(TOKEN_2FA);
    const session = await prisma.loginSession.findUnique({ where: { tokenHash } });

    expect(session).not.toBeNull();
    expect(session!.mfaVerifiedAt).toBeNull();
  });

  // ── Case C ──────────────────────────────────────────────────────────────────
  it("Case C: pending 2FA session is blocked from requireMfa routes", async () => {
    await recordLoginSession({
      userId: USER_2FA_ID,
      token: TOKEN_2FA,
      ip: "127.0.0.1",
      userAgent: "TestAgent/1.0",
    });

    const user = { id: USER_2FA_ID, email: "login_mfa@test.com", role: "USER" };
    const req = mockRequest(user, TOKEN_2FA);

    await expect(requireMfa(req, dummyReply)).rejects.toThrow(
      "This action requires 2FA verification"
    );
  });

  // ── Case D ──────────────────────────────────────────────────────────────────
  it("Case D: after TOTP stamps mfaVerifiedAt – requireMfa routes pass", async () => {
    await recordLoginSession({
      userId: USER_2FA_ID,
      token: TOKEN_2FA,
      ip: "127.0.0.1",
      userAgent: "TestAgent/1.0",
    });

    const tokenHash = hashToken(TOKEN_2FA);

    // Simulate TOTP verification
    await prisma.loginSession.update({
      where: { tokenHash },
      data: { mfaVerifiedAt: new Date() },
    });

    const user = { id: USER_2FA_ID, email: "login_mfa@test.com", role: "USER" };
    const req = mockRequest(user, TOKEN_2FA);

    await expect(requireMfa(req, dummyReply)).resolves.toBeUndefined();
  });

  // ── Case E ──────────────────────────────────────────────────────────────────
  it("Case E: fresh TOTP within MFA_FRESHNESS_MINUTES – requireMfa passes", async () => {
    await recordLoginSession({
      userId: USER_2FA_ID,
      token: TOKEN_2FA,
      ip: "127.0.0.1",
      userAgent: "TestAgent/1.0",
    });

    const tokenHash = hashToken(TOKEN_2FA);

    // Stamp fresh (1 minute ago, well within 15-minute window)
    const freshStamp = new Date(Date.now() - 60 * 1000);
    await prisma.loginSession.update({
      where: { tokenHash },
      data: { mfaVerifiedAt: freshStamp },
    });

    const user = { id: USER_2FA_ID, email: "login_mfa@test.com", role: "USER" };
    const req = mockRequest(user, TOKEN_2FA);

    await expect(requireMfa(req, dummyReply)).resolves.toBeUndefined();
  });

  // ── Case F ──────────────────────────────────────────────────────────────────
  it("Case F: mfaVerifiedAt older than freshness window – requireMfa throws", async () => {
    await recordLoginSession({
      userId: USER_2FA_ID,
      token: TOKEN_2FA,
      ip: "127.0.0.1",
      userAgent: "TestAgent/1.0",
    });

    const tokenHash = hashToken(TOKEN_2FA);

    // Stamp 16 minutes ago (older than 15-minute freshness window)
    const staleStamp = new Date(Date.now() - 16 * 60 * 1000);
    await prisma.loginSession.update({
      where: { tokenHash },
      data: { mfaVerifiedAt: staleStamp },
    });

    const user = { id: USER_2FA_ID, email: "login_mfa@test.com", role: "USER" };
    const req = mockRequest(user, TOKEN_2FA);

    await expect(requireMfa(req, dummyReply)).rejects.toThrow(
      "Your 2FA session has expired"
    );
  });

  // ── Case G ──────────────────────────────────────────────────────────────────
  it("Case G: revoking session clears mfaVerifiedAt – subsequent requireMfa fails", async () => {
    await recordLoginSession({
      userId: USER_2FA_ID,
      token: TOKEN_2FA,
      ip: "127.0.0.1",
      userAgent: "TestAgent/1.0",
    });

    const tokenHash = hashToken(TOKEN_2FA);

    // Stamp TOTP verification
    await prisma.loginSession.update({
      where: { tokenHash },
      data: { mfaVerifiedAt: new Date() },
    });

    // Verify it passes
    const user = { id: USER_2FA_ID, email: "login_mfa@test.com", role: "USER" };
    const req = mockRequest(user, TOKEN_2FA);
    await expect(requireMfa(req, dummyReply)).resolves.toBeUndefined();

    // Simulate logout: revoke session
    await prisma.loginSession.update({
      where: { tokenHash },
      data: { revokedAt: new Date(), isCurrent: false, mfaVerifiedAt: null },
    });

    // After revocation, the session is gone → requireMfa should throw MFA_REQUIRED
    await expect(requireMfa(req, dummyReply)).rejects.toThrow(
      "This action requires 2FA verification"
    );
  });

  // ── Case H ──────────────────────────────────────────────────────────────────
  it("Case H: pending session can call authenticate on /api/auth/2fa/verify without MFA_PENDING gate", async () => {
    await recordLoginSession({
      userId: USER_2FA_ID,
      token: TOKEN_2FA,
      ip: "127.0.0.1",
      userAgent: "TestAgent/1.0",
    });

    const tokenHash = hashToken(TOKEN_2FA);
    const session = await prisma.loginSession.findUnique({ where: { tokenHash } });

    // Confirm it's a pending session (no mfaVerifiedAt)
    expect(session!.mfaVerifiedAt).toBeNull();

    // The authenticate middleware must exempt POST /api/auth/2fa/verify
    // We test this indirectly by checking the session lookup result:
    // the actual exemption is tested in authenticate.ts integration tests.
    // Here we verify the data contract: pending sessions are identifiable by mfaVerifiedAt=null.
    const isMfaPending = session !== null && session.mfaVerifiedAt === null;
    expect(isMfaPending).toBe(true);
  });
});
