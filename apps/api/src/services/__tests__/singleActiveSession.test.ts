import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import {
  recordLoginSession,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  hashToken,
} from "../sessions";

describe("Single Active Session Management", () => {
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  const testUserId = `test-single-user-${uniqueSuffix}`;
  const testUsername = `user_${uniqueSuffix}`;

  beforeAll(async () => {
    // Ensure test user exists
    await prisma.user.upsert({
      where: { id: testUserId },
      create: {
        id: testUserId,
        email: `${testUserId}@example.com`,
        username: testUsername,
        displayName: "Single Session Test User",
        role: "USER",
      },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.loginSession.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  beforeEach(async () => {
    // Clean up any test sessions for this user
    await prisma.loginSession.deleteMany({
      where: { userId: testUserId },
    });
  });


  it("1. First login creates exactly one active session", async () => {
    const token1 = "token_session_1";
    await recordLoginSession({
      userId: testUserId,
      token: token1,
      ip: "127.0.0.1",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });

    const active = await listSessions(testUserId, hashToken(token1));
    expect(active.length).toBe(1);
    expect(active[0].isCurrent).toBe(true);
    expect(active[0].revokedAt).toBeNull();
    expect(active[0].deviceName).toBe("Windows PC");
  });

  it("2. Second login automatically revokes the first session and activates the new one", async () => {
    const token1 = "token_session_1";
    const token2 = "token_session_2";

    // Login 1
    await recordLoginSession({
      userId: testUserId,
      token: token1,
      ip: "127.0.0.1",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });

    // Login 2 (on mobile)
    await recordLoginSession({
      userId: testUserId,
      token: token2,
      ip: "192.168.1.50",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
    });

    // Verify in database: session 1 is revoked, session 2 is active
    const session1 = await prisma.loginSession.findUnique({
      where: { tokenHash: hashToken(token1) },
    });
    const session2 = await prisma.loginSession.findUnique({
      where: { tokenHash: hashToken(token2) },
    });

    expect(session1?.revokedAt).not.toBeNull();
    expect(session1?.isCurrent).toBe(false);

    expect(session2?.revokedAt).toBeNull();
    expect(session2?.isCurrent).toBe(true);

    // Active session listing only returns 1 session (session 2)
    const activeList = await listSessions(testUserId, hashToken(token2));
    expect(activeList.length).toBe(1);
    expect(activeList[0].deviceName).toBe("Mobile");
    expect(activeList[0].isCurrent).toBe(true);
  });

  it("3. Third login revokes the second session, maintaining maximum 1 active session", async () => {
    const token1 = "token_1";
    const token2 = "token_2";
    const token3 = "token_3";

    await recordLoginSession({ userId: testUserId, token: token1, ip: "1.1.1.1", userAgent: "Desktop" });
    await recordLoginSession({ userId: testUserId, token: token2, ip: "2.2.2.2", userAgent: "Tablet" });
    await recordLoginSession({ userId: testUserId, token: token3, ip: "3.3.3.3", userAgent: "Mac" });

    const allSessions = await prisma.loginSession.findMany({
      where: { userId: testUserId },
      orderBy: { createdAt: "asc" },
    });

    // Total records stored
    expect(allSessions.length).toBe(3);

    // Session 1 & 2 are revoked
    expect(allSessions[0].revokedAt).not.toBeNull();
    expect(allSessions[1].revokedAt).not.toBeNull();

    // Session 3 is active
    expect(allSessions[2].revokedAt).toBeNull();
    expect(allSessions[2].isCurrent).toBe(true);

    // listSessions returns only the 1 active session
    const activeList = await listSessions(testUserId, hashToken(token3));
    expect(activeList.length).toBe(1);
    expect(activeList[0].id).toBe(allSessions[2].id);
    expect(activeList[0].isCurrent).toBe(true);
  });

  it("4. Concurrent / simultaneous logins result in exactly 1 active session", async () => {
    const tokens = Array.from({ length: 5 }, (_, i) => `concurrent_token_${i}`);

    // Fire 5 login requests concurrently
    await Promise.all(
      tokens.map((token, i) =>
        recordLoginSession({
          userId: testUserId,
          token,
          ip: `10.0.0.${i}`,
          userAgent: "Windows PC",
        })
      )
    );

    // Verify DB state: exactly 1 active session
    const activeInDb = await prisma.loginSession.findMany({
      where: { userId: testUserId, revokedAt: null },
    });

    expect(activeInDb.length).toBe(1);

    const activeList = await listSessions(testUserId, activeInDb[0].tokenHash);
    expect(activeList.length).toBe(1);
    expect(activeList[0].isCurrent).toBe(true);
  });

  it("5. Manual session revocation works correctly", async () => {
    const token = "token_manual_revoke";
    const session = await recordLoginSession({
      userId: testUserId,
      token,
      ip: "127.0.0.1",
      userAgent: "Desktop",
    });

    // Revoking another session ID or older session
    await revokeSession(testUserId, session.id);

    const check = await prisma.loginSession.findUnique({
      where: { id: session.id },
    });
    expect(check?.revokedAt).not.toBeNull();

    const activeList = await listSessions(testUserId);
    expect(activeList.length).toBe(0);
  });

  it("6. revokeOtherSessions preserves the current active session", async () => {
    const currentToken = "current_active_token";
    await recordLoginSession({
      userId: testUserId,
      token: currentToken,
      ip: "127.0.0.1",
      userAgent: "Desktop",
    });

    const res = await revokeOtherSessions(testUserId, hashToken(currentToken));
    expect(res.ok).toBe(true);

    const activeList = await listSessions(testUserId, hashToken(currentToken));
    expect(activeList.length).toBe(1);
    expect(activeList[0].isCurrent).toBe(true);
  });

  it("7. Refreshing same token does not duplicate or revoke itself", async () => {
    const token = `token_refresh_${uniqueSuffix}`;
    await recordLoginSession({
      userId: testUserId,
      token,
      ip: "127.0.0.1",
      userAgent: "Desktop",
    });

    // Re-exchange same token
    await recordLoginSession({
      userId: testUserId,
      token,
      ip: "127.0.0.1",
      userAgent: "Desktop",
    });

    const count = await prisma.loginSession.count({
      where: { userId: testUserId, tokenHash: hashToken(token) },
    });
    expect(count).toBe(1);

    const activeList = await listSessions(testUserId, hashToken(token));
    expect(activeList.length).toBe(1);
    expect(activeList[0].isCurrent).toBe(true);
  });

  it("8. User cannot revoke another user's session", async () => {

    const anotherUserToken = `another_user_token_${uniqueSuffix}`;
    const anotherUserId = `test-other-user-${uniqueSuffix}`;

    await prisma.user.upsert({
      where: { id: anotherUserId },
      create: {
        id: anotherUserId,
        email: `${anotherUserId}@example.com`,
        username: `other_${uniqueSuffix}`,
        displayName: "Other User",
        role: "USER",
      },
      update: {},
    });

    const otherSession = await recordLoginSession({
      userId: anotherUserId,
      token: anotherUserToken,
      ip: "127.0.0.1",
      userAgent: "Desktop",
    });

    // testUserId tries to revoke anotherUserId's session -> throws NOT_FOUND
    await expect(revokeSession(testUserId, otherSession.id)).rejects.toThrow("Session not found");

    // Clean up other user
    await prisma.loginSession.deleteMany({ where: { userId: anotherUserId } });
    await prisma.user.deleteMany({ where: { id: anotherUserId } });
  });

  it("9. Trying to manually revoke the current session throws VALIDATION_ERROR", async () => {
    const currentToken = `token_cant_self_revoke_${uniqueSuffix}`;
    const session = await recordLoginSession({
      userId: testUserId,
      token: currentToken,
      ip: "127.0.0.1",
      userAgent: "Desktop",
    });

    await expect(
      revokeSession(testUserId, session.id, hashToken(currentToken))
    ).rejects.toThrow("You cannot revoke the session you are using");
  });

  it("10. Expired sessions are automatically filtered out from active session listings", async () => {
    const expiredToken = `token_expired_${uniqueSuffix}`;
    const tokenHash = hashToken(expiredToken);

    await prisma.loginSession.create({
      data: {
        userId: testUserId,
        tokenHash,
        ip: "127.0.0.1",
        userAgent: "Desktop",
        deviceName: "Desktop",
        isCurrent: true,
        expiresAt: new Date(Date.now() - 1000 * 60), // expired 1 min ago
        revokedAt: null,
      },
    });

    const activeList = await listSessions(testUserId, tokenHash);
    expect(activeList.length).toBe(0);
  });
});


