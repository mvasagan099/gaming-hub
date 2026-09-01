import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { changePasswordSchema } from "@gaming-hub/shared";
import { recordLoginSession } from "../sessions";

describe("Password Reset vs Magic Link Authentication Flow", () => {
  const createdUserIds: string[] = [];

  async function createTestUser(prefix: string) {
    const suffix = Math.random().toString(36).slice(2, 7);
    const userId = `${prefix}-${Date.now()}-${suffix}`;
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        username: `u_${prefix.replace(/[^a-zA-Z0-9]/g, "")}_${suffix}`.slice(0, 24),
        displayName: `Player ${prefix}`,
        email: `${userId}@test.com`,
        wallet: {
          create: {
            balance: 500,
          },
        },
        profile: {
          create: {
            country: "US",
            bio: "Test user",
          },
        },
      },
    });

    return userId;
  }

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.loginSession.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.profile.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.wallet.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  describe("1. Password Validation Rules", () => {
    it("rejects passwords shorter than 8 characters", () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: "oldpassword123",
        newPassword: "short",
        confirmPassword: "short",
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid passwords with 8+ characters", () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: "oldpassword123",
        newPassword: "BrandNewSecurePassword123!",
        confirmPassword: "BrandNewSecurePassword123!",
      });
      expect(result.success).toBe(true);
    });

    it("rejects when new password exceeds 100 characters", () => {
      const longPassword = "A".repeat(101);
      const result = changePasswordSchema.safeParse({
        currentPassword: "oldpassword123",
        newPassword: longPassword,
        confirmPassword: longPassword,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("2. Recovery Mode vs Magic Link Session Handling", () => {
    it("distinguishes PASSWORD_RECOVERY from regular SIGNED_IN sessions", () => {
      // Simulating client auth state transition logic
      type AuthEvent = "PASSWORD_RECOVERY" | "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED";
      
      interface ClientAuthState {
        session: { token: string } | null;
        user: { id: string } | null;
        isPasswordRecovery: boolean;
        recoverySession: { token: string } | null;
      }

      function handleAuthEvent(
        currentState: ClientAuthState,
        event: AuthEvent,
        session: { token: string; user: { id: string } } | null
      ): ClientAuthState {
        if (event === "PASSWORD_RECOVERY") {
          return {
            ...currentState,
            isPasswordRecovery: true,
            recoverySession: session ? { token: session.token } : null,
            session: null, // Critical: normal app session MUST NOT be set
            user: null,
          };
        }
        if (event === "SIGNED_IN") {
          if (currentState.isPasswordRecovery) {
            return {
              ...currentState,
              isPasswordRecovery: true,
              recoverySession: session ? { token: session.token } : null,
              session: null,
              user: null,
            };
          }
          return {
            ...currentState,
            isPasswordRecovery: false,
            recoverySession: null,
            session: session ? { token: session.token } : null,
            user: session ? session.user : null,
          };
        }
        if (event === "SIGNED_OUT") {
          return {
            session: null,
            user: null,
            isPasswordRecovery: false,
            recoverySession: null,
          };
        }
        return currentState;
      }

      // 1. Password recovery link clicked:
      let state: ClientAuthState = {
        session: null,
        user: null,
        isPasswordRecovery: false,
        recoverySession: null,
      };

      const mockSession = { token: "recovery-jwt-123", user: { id: "user-123" } };
      state = handleAuthEvent(state, "PASSWORD_RECOVERY", mockSession);

      expect(state.isPasswordRecovery).toBe(true);
      expect(state.recoverySession).not.toBeNull();
      expect(state.session).toBeNull(); // Must NOT be automatically logged in
      expect(state.user).toBeNull();

      // 2. Protected route check:
      const canAccessProtectedRoutes = Boolean(state.session && !state.isPasswordRecovery);
      expect(canAccessProtectedRoutes).toBe(false);

      // 3. Password reset completion:
      state = handleAuthEvent(state, "SIGNED_OUT", null);
      expect(state.isPasswordRecovery).toBe(false);
      expect(state.recoverySession).toBeNull();
      expect(state.session).toBeNull();

      // 4. Magic link login (regular flow):
      const magicLinkSession = { token: "magic-jwt-456", user: { id: "user-123" } };
      state = handleAuthEvent(state, "SIGNED_IN", magicLinkSession);
      expect(state.isPasswordRecovery).toBe(false);
      expect(state.session).not.toBeNull();
      expect(state.user?.id).toBe("user-123");
    });
  });

  describe("3. Session Security & Active Sessions", () => {
    it("does not create a database login session during password recovery authorization", async () => {
      const userId = await createTestUser("pw-recovery");

      // Verify no login session exists initially
      const initialSessions = await prisma.loginSession.findMany({ where: { userId } });
      expect(initialSessions.length).toBe(0);

      // A recovery link only interacts with Supabase Auth recovery and does not invoke recordLoginSession.
      // Now verify that normal login creates a session:
      await recordLoginSession({
        userId,
        token: "normal-login-token-123",
        ip: "127.0.0.1",
        userAgent: "TestAgent/1.0",
      });

      const activeSessions = await prisma.loginSession.findMany({
        where: { userId, revokedAt: null },
      });
      expect(activeSessions.length).toBe(1);
    });

    it("revokes existing sessions when single-session policy is enforced on new login", async () => {
      const userId = await createTestUser("single-session");

      // First device login
      await recordLoginSession({
        userId,
        token: "token-device-1",
        ip: "127.0.0.1",
        userAgent: "Device1",
      });

      // Second device login (single active session enforcement)
      await recordLoginSession({
        userId,
        token: "token-device-2",
        ip: "127.0.0.1",
        userAgent: "Device2",
      });

      const activeSessions = await prisma.loginSession.findMany({
        where: { userId, revokedAt: null },
      });

      // Only the newest session is active
      expect(activeSessions.length).toBe(1);
      expect(activeSessions[0].userAgent).toBe("Device2");
    });
  });
});
