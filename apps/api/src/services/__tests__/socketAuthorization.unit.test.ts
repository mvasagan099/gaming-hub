import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ loginSession: { findUnique: vi.fn(), findFirst: vi.fn() }, user: { findUnique: vi.fn() }, profile: { findUnique: vi.fn() }, playerPenalty: { findFirst: vi.fn() } }));
vi.mock("@gaming-hub/db", async (original) => ({ ...await original<typeof import("@gaming-hub/db")>(), prisma: db }));
vi.mock("../../../../socket-server/src/env", () => ({ env: { NODE_ENV: "production", SUPABASE_URL: "https://supabase.invalid", requireEmailVerification: false } }));
vi.mock("jose", () => ({ createRemoteJWKSet: vi.fn(), jwtVerify: vi.fn(async () => ({ payload: { sub: "owner", exp: Date.now() / 1000 + 60 } })) }));
vi.mock("../../../../socket-server/src/users", () => ({ ensureUser: vi.fn(async () => ({ id: "owner", role: "ADMIN", username: "owner", displayName: "Owner", avatarUrl: null })) }));
import { authenticateToken } from "../../../../socket-server/src/auth";

describe("socket eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.loginSession.findUnique.mockResolvedValue({ userId: "owner", revokedAt: null, expiresAt: new Date(Date.now() + 60_000), mfaVerifiedAt: new Date() });
    db.user.findUnique.mockResolvedValue({ id: "owner", role: "ADMIN", username: "owner", displayName: "Owner", avatarUrl: null });
    db.profile.findUnique.mockResolvedValue({ twoFactorEnabled: true });
    db.playerPenalty.findFirst.mockResolvedValue(null);
  });
  it("requires an application session even without enabled 2FA", async () => {
    db.loginSession.findUnique.mockResolvedValue(null);
    db.profile.findUnique.mockResolvedValue({ twoFactorEnabled: false });
    await expect(authenticateToken("signed-credential")).rejects.toThrow();
  });
  it("cannot use another account's session record", async () => {
    const session = await db.loginSession.findUnique();
    db.loginSession.findUnique.mockResolvedValue({ ...session, userId: "other" });
    await expect(authenticateToken("signed-credential")).rejects.toThrow();
  });
  it("rejects pending MFA", async () => {
    const session = await db.loginSession.findUnique();
    db.loginSession.findUnique.mockResolvedValue({ ...session, mfaVerifiedAt: null });
    await expect(authenticateToken("signed-credential")).rejects.toThrow("MFA_PENDING");
  });
  it("rejects account bans", async () => {
    db.playerPenalty.findFirst.mockResolvedValue({ id: "ban" });
    await expect(authenticateToken("signed-credential")).rejects.toThrow("ACCOUNT_BANNED");
  });
  it("requests socket reauthentication after proven same-provider refresh", async () => {
    const session = await db.loginSession.findUnique();
    db.loginSession.findUnique.mockResolvedValue({ ...session, revokedAt: new Date(), providerSessionId: 'verified-provider-session' });
    db.loginSession.findFirst.mockResolvedValue({ ...session, revokedAt: null });
    await expect(authenticateToken('signed-credential')).rejects.toThrow('TOKEN_REFRESH');
  });
});
