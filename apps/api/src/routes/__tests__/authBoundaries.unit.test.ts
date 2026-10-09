import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
const db = vi.hoisted(() => {
  const model = () => ({ findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), delete: vi.fn() });
  return { user: model(), profile: model(), loginSession: model(), playerPenalty: model(), customRole: model(), rolePermission: model(), siteSetting: model(), appVersionConfig: model(), $transaction: vi.fn() };
});
const identity = vi.hoisted(() => ({ user: { id: "actor", role: "ADMIN", customRoleId: null as string | null, email: "actor@test.invalid" } }));
vi.mock("@gaming-hub/db", async (original) => ({ ...await original<typeof import("@gaming-hub/db")>(), prisma: db }));
vi.mock("../../auth/supabase", () => ({ verifyAccessToken: vi.fn(async () => ({ sub: identity.user.id, emailVerified: true })) }));
vi.mock("../../services/users", () => ({ ensureUser: vi.fn(async () => identity.user), getAuthenticatedUserData: vi.fn() }));
vi.mock("../../services/audit", () => ({ auditFromRequest: vi.fn() }));
import { adminRolesRoutes } from "../adminRoles";
import { adminAntiCheatRoutes } from "../adminAntiCheat";
import { adminAppVersionRoutes } from "../adminAppVersion";
import { securityRoutes } from "../security";
import { authenticate, requireMfa } from "../../plugins/authenticate";
import { requirePermission } from "../../lib/permissions";
import { resetSettingsCache } from "../../services/settings";
import { hashToken } from "../../services/sessions";

describe("application session and delegated authorization boundaries", () => {
  let app: ReturnType<typeof Fastify>;
  const headers = { authorization: "Bearer credential" };
  beforeEach(async () => {
    vi.resetAllMocks();
    Object.assign(identity.user, { role: "ADMIN", customRoleId: null });
    resetSettingsCache();
    db.$transaction.mockImplementation((fn) => typeof fn === "function" ? fn(db) : Promise.all(fn));
    db.profile.findUnique.mockResolvedValue({ twoFactorEnabled: true, passwordHash: null });
    db.user.update.mockResolvedValue(identity.user);
    db.playerPenalty.findFirst.mockResolvedValue(null);
    db.loginSession.findUnique.mockResolvedValue({ id: "session", userId: "actor", tokenHash: hashToken("credential"), revokedAt: null, expiresAt: new Date(Date.now() + 60_000), mfaVerifiedAt: new Date() });
    db.loginSession.findMany.mockResolvedValue([]);
    db.siteSetting.findMany.mockResolvedValue([]);
    app = Fastify();
    app.setErrorHandler((error: any, _request: any, reply: any) => reply.code(error.statusCode ?? error.status ?? 500).send({ error: { code: error.code, message: error.message } }));
    await app.register(adminRolesRoutes);
    await app.register(adminAppVersionRoutes);
    await app.register(securityRoutes);
    await app.register(adminAntiCheatRoutes);
    app.get("/protected", { preHandler: authenticate }, async () => ({ ok: true }));
  });
  afterEach(async () => { await app.close(); });
  it("does not swallow failed session enrollment", async () => {
    db.loginSession.findUnique.mockResolvedValue(null);
    db.$transaction.mockRejectedValue(new Error("database unavailable"));
    expect((await app.inject({ url: "/protected", headers })).statusCode).toBe(500);
  });
  it("denies active account penalties on the API", async () => {
    db.playerPenalty.findFirst.mockResolvedValue({ id: "ban" });
    const res = await app.inject({ url: "/protected", headers });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("ACCOUNT_BANNED");
  });
  for (const change of [{ revokedAt: new Date() }, { userId: "someone-else" }, { expiresAt: new Date(0) }]) {
    it(`rejects unusable step-up session ${Object.keys(change)[0]}`, async () => {
      const session = await db.loginSession.findUnique();
      db.loginSession.findUnique.mockResolvedValue({ ...session, ...change });
      await expect(requireMfa({ user: identity.user, headers } as any, {} as any)).rejects.toMatchObject({ code: "MFA_REQUIRED" });
    });
  }
  it("resolves delegated permissions without an explicit database argument", async () => {
    Object.assign(identity.user, { role: "CUSTOM", customRoleId: "delegate" });
    db.customRole.findUnique.mockResolvedValue({ permissions: [{ permission: "admin:settings:view" }] });
    await expect(requirePermission({ user: identity.user } as any, "admin:settings:view")).resolves.toEqual(identity.user);
  });
  it("a delegated role creator cannot grant unowned wallet privileges", async () => {
    Object.assign(identity.user, { role: "CUSTOM", customRoleId: "delegate" });
    db.customRole.findUnique.mockImplementation(async ({ where }: any) => where.id ? { permissions: [{ permission: "admin:roles:create" }] } : null);
    db.customRole.create.mockResolvedValue({ id: "role", permissions: [], createdAt: new Date() });
    const res = await app.inject({ method: "POST", url: "/api/admin/roles", headers, payload: { name: "elevated", displayName: "Elevated", permissions: ["admin:wallet:adjust"] } });
    expect(res.statusCode).toBe(403);
    expect(db.customRole.create).not.toHaveBeenCalled();
  });
  for (const stamp of [null, new Date(Date.now() - 3600_000)]) {
    it(`authenticator replacement requires fresh existing MFA (${stamp ? "stale" : "none"})`, async () => {
      const session = await db.loginSession.findUnique();
      db.loginSession.findUnique.mockResolvedValue({ ...session, mfaVerifiedAt: stamp });
      const res = await app.inject({ method: "POST", url: "/api/security/2fa/setup", headers, payload: { reset: true } });
      expect(res.statusCode).toBe(403);
      expect(db.profile.update).not.toHaveBeenCalled();
    });
    it(`version configuration requires fresh MFA (${stamp ? "stale" : "none"})`, async () => {
      const session = await db.loginSession.findUnique();
      db.loginSession.findUnique.mockResolvedValue({ ...session, mfaVerifiedAt: stamp });
      const res = await app.inject({ method: "PUT", url: "/api/admin/app/version-config", headers, payload: { latestVersion: "1.0", minimumSupportedVersion: "1.0", downloadUrl: "https://test.invalid/app", updateMessage: "Update", forceUpdate: false } });
      expect(res.statusCode).toBe(403);
      expect(db.appVersionConfig.upsert).not.toHaveBeenCalled();
    });
  }
  it("read-only version configuration never creates a record", async () => {
    db.appVersionConfig.findFirst.mockResolvedValue(null);
    const res = await app.inject({ url: "/api/admin/app/version-config", headers });
    expect(res.statusCode).toBe(200);
    expect(db.appVersionConfig.create).not.toHaveBeenCalled();
  });
  it('view-only game authority cannot ingest anti-cheat events', async () => {
    Object.assign(identity.user, { role: 'CUSTOM', customRoleId: 'viewer' });
    db.customRole.findUnique.mockResolvedValue({ permissions: [{ permission: 'admin:games:view' }] });
    expect((await app.inject({ url: '/api/admin/security/anti-cheat/events', headers })).statusCode).toBe(200);
    const res = await app.inject({ method: 'POST', url: '/api/admin/security/anti-cheat/events', headers, payload: { userId: 'owner', eventType: 'WRONG_TURN', severity: 'LOW' } });
    expect(res.statusCode).toBe(403);
  });
  it('unenrolled administrators cannot mutate security configuration, but can read it', async () => {
    db.profile.findUnique.mockResolvedValue({ twoFactorEnabled: false });
    expect((await app.inject({ url: '/api/admin/app/version-config', headers })).statusCode).toBe(200);
    const res = await app.inject({ method: 'PUT', url: '/api/admin/app/version-config', headers, payload: { latestVersion: '1.0', minimumSupportedVersion: '1.0', downloadUrl: 'https://test.invalid/app', updateMessage: 'Update', forceUpdate: false } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('MFA_ENROLLMENT_REQUIRED');
  });
  it('enrolled administrators with fresh MFA can update security configuration', async () => {
    db.appVersionConfig.upsert.mockResolvedValue({ id: 'config', latestVersion: '1.0', minimumSupportedVersion: '1.0', forceUpdate: false });
    const res = await app.inject({ method: 'PUT', url: '/api/admin/app/version-config', headers, payload: { latestVersion: '1.0', minimumSupportedVersion: '1.0', downloadUrl: 'https://test.invalid/app', updateMessage: 'Update', forceUpdate: false } });
    expect(res.statusCode).toBe(200);
    expect(db.appVersionConfig.upsert).toHaveBeenCalledOnce();
  });

});
