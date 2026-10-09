import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { update: vi.fn() },
  loginSession: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@gaming-hub/db", async (original) => ({ ...await original<typeof import("@gaming-hub/db")>(), prisma: db }));
import { recordLoginSession } from "../sessions";

describe("irreversible credential revocation", () => {
  const input = { userId: "owner", token: "credential", ip: null, userAgent: null };
  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation((fn) => fn(db));
    db.loginSession.findMany.mockResolvedValue([]);
    db.loginSession.findUnique.mockResolvedValue(null);
  });
  it("rejects revoked session exchange before revoking the current login", async () => {
    db.loginSession.findUnique.mockResolvedValue({ id: "old", userId: "owner", revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
    await expect(recordLoginSession(input)).rejects.toMatchObject({ code: "SESSION_REVOKED" });
    expect(db.loginSession.updateMany).not.toHaveBeenCalled();
    expect(db.loginSession.update).not.toHaveBeenCalled();
  });
  it("rejects expired session exchange", async () => {
    db.loginSession.findUnique.mockResolvedValue({ id: "old", userId: "owner", expiresAt: new Date(0), revokedAt: null });
    await expect(recordLoginSession(input)).rejects.toMatchObject({ code: "SESSION_REVOKED" });
  });
  it("does not prune revoked credentials while their validity period remains open", async () => {
    await recordLoginSession(input);
    const query = db.loginSession.findMany.mock.calls[0][0];
    expect(query.where.OR).toBeUndefined();
    expect(query.where.expiresAt).toEqual({ lt: expect.any(Date) });
  });
  it("does not extend lifetime or clear revocation on idempotent recording", async () => {
    db.loginSession.findUnique.mockResolvedValue({ id: "current", userId: "owner", expiresAt: new Date(Date.now() + 60_000), revokedAt: null });
    await recordLoginSession(input);
    expect(db.loginSession.update.mock.calls[0][0].data).not.toHaveProperty("revokedAt");
    expect(db.loginSession.update.mock.calls[0][0].data).not.toHaveProperty("expiresAt");
  });
  it("rejects refreshed tokens from a revoked provider session", async () => {
    db.loginSession.findFirst.mockResolvedValue({ userId: 'owner', revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
    await expect(recordLoginSession({ ...input, token: 'new-token', providerSessionId: 'signed-provider-session-id' })).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    expect(db.loginSession.create).not.toHaveBeenCalled();
  });
  it("preserves original MFA freshness only within the same verified provider session", async () => {
    const stamp = new Date(Date.now() - 60_000), expiry = new Date(Date.now() + 60_000);
    db.loginSession.findFirst.mockResolvedValue({ userId: 'owner', revokedAt: null, expiresAt: expiry, mfaVerifiedAt: stamp });
    await recordLoginSession({ ...input, token: 'new-token', providerSessionId: 'same-provider-session' });
    expect(db.loginSession.create.mock.calls[0][0].data).toMatchObject({ mfaVerifiedAt: stamp, expiresAt: expiry, providerSessionId: 'same-provider-session' });
  });
  it("a new provider login cannot inherit old MFA", async () => {
    db.loginSession.findFirst.mockResolvedValue(null);
    await recordLoginSession({ ...input, providerSessionId: 'different-provider-session' });
    expect(db.loginSession.create.mock.calls[0][0].data.mfaVerifiedAt).toBeNull();
  });

});
