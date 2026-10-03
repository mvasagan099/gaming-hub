import { hasVerifiedEmail } from "@gaming-hub/shared";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import { prisma } from "@gaming-hub/db";
import Fastify from "fastify";
import { createTestUser } from "../../../test/helpers";
import { resetTestDatabase } from "../../../test/db";
import { validateTestDatabaseUrl } from "../../../test/databaseSafety";
import { WalletTransactionService } from "../walletTransactionService";
import { CouponVaultService } from "../couponVaultService";
import { applyTransaction, reconcileUnconfirmedTransfer } from "../wallet";
import { createWithdrawalRequest, cancelWalletRequest, rejectWalletRequest, approveWalletRequest } from "../walletRequests";
import { resolveWithdrawal } from "../withdrawalResolution";
import { PostgresRateLimitStore } from "../sharedRateLimit";
import { hashToken } from "../sessions";
import { env } from "../../env";
import { adminTournamentsRoutes } from "../../routes/adminTournaments";
import * as engine from "../tournamentEngine";
import { buildApp } from "../../app";
import { generateSecret, generate, NobleCryptoPlugin, ScureBase32Plugin } from "otplib";

beforeEach(async () => { await resetTestDatabase(); });
afterEach(() => vi.restoreAllMocks());

async function held(fee = 10) {
  const u = await createTestUser();
  await prisma.$transaction(tx => WalletTransactionService.createCredit(tx, {
    userId: u.id, amount: 1000, referenceType: "ADMIN", referenceId: crypto.randomUUID(),
  }));
  const id = crypto.randomUUID();
  await prisma.$transaction(async tx => {
    await tx.walletRequest.create({ data: { id, userId: u.id, kind: "WITHDRAWAL", amount: 100, fee,
      status: "PENDING", method: "COUPONVAULT", externalTransferId: id, adminNote: "UNCONFIRMED_HOLD" } });
    await applyTransaction(tx, u.id, -(100 + fee), "WITHDRAWAL", id, {}, "MAIN");
  });
  return { u, id };
}

describe("withdrawal outcome safety", () => {
  it.each(["PENDING", "UNKNOWN", "PROCESSING", "", "SUCCESS"])("false processed with %s never refunds", async status => {
    const { u, id } = await held();
    vi.spyOn(CouponVaultService, "checkTransferStatus").mockResolvedValue({ success: true, processed: false, status });
    expect((await reconcileUnconfirmedTransfer(id)).resolution).toBe("HELD");
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(890);
  });
  it("unknown transfer cannot be cancelled, rejected, or approved again", async () => {
    const { u, id } = await held();
    const transfer = vi.spyOn(CouponVaultService, "transferToCouponWallet");
    await expect(cancelWalletRequest(u.id, id)).rejects.toMatchObject({ statusCode: 409 });
    await expect(rejectWalletRequest(u.id, id, "reject")).rejects.toMatchObject({ statusCode: 409 });
    await expect(approveWalletRequest(u.id, id)).rejects.toMatchObject({ statusCode: 409 });
    expect(transfer).not.toHaveBeenCalled();
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(890);
  });
  it("concurrent definitive refunds restore principal and fee exactly once", async () => {
    const { u, id } = await held();
    await Promise.all([resolveWithdrawal(id, "REFUNDED"), resolveWithdrawal(id, "REFUNDED")]);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(1000);
    expect(await prisma.transaction.count({ where: { referenceId: id, referenceType: "REVERSAL" } })).toBe(1);
  });
  it("a stale reconciliation worker cannot refund a newer claim", async () => {
    const { u, id } = await held();
    await prisma.walletRequest.update({ where: { id }, data: { adminNote: "PROCESSING", processingStartedAt: new Date() } });
    await resolveWithdrawal(id, "REFUNDED", new Date(0));
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(890);
  });
  it("provider identity or amount mismatch stays held", async () => {
    const { id } = await held();
    vi.spyOn(CouponVaultService, "checkTransferStatus").mockResolvedValue({ success: true, processed: true,
      status: "SUCCESS", amount: 200, transactionId: "different-id" });
    expect((await reconcileUnconfirmedTransfer(id)).resolution).toBe("HELD");
  });
  it("confirmed provider success plus local completion-write failure never refunds", async () => {
    const { u, id } = await held();
    await prisma.walletRequest.delete({ where: { id } });
    await prisma.profile.update({ where: { userId: u.id }, data: { twoFactorEnabled: true } });
    vi.spyOn(CouponVaultService, "transferToCouponWallet").mockResolvedValue({ success: true });
    const transaction = prisma.$transaction.bind(prisma);
    let failCompletion = true;
    const update = vi.spyOn(prisma, "$transaction").mockImplementation(((callback: any, options: any) => transaction(async (tx: any) => {
      const wrapped = new Proxy(tx, { get(target, property) {
        if (property !== "walletRequest") return Reflect.get(target, property);
        return new Proxy(tx.walletRequest, { get(model, method) {
          if (method !== "update") return Reflect.get(model, method);
          return async (args: any) => {
            if (failCompletion && args.data.status === "APPROVED") { failCompletion = false; throw new Error("local completion write failed"); }
            return model.update(args);
          };
        } });
      } });
      return callback(wrapped);
    }, options)) as any);
    await expect(createWithdrawalRequest(u.id, 100)).rejects.toMatchObject({ statusCode: 504 });
    update.mockRestore();
    const r = await prisma.walletRequest.findFirstOrThrow({ where: { userId: u.id } });
    expect(r.adminNote).toBe("UNCONFIRMED_HOLD");
    expect(await prisma.transaction.count({ where: { referenceId: r.id, referenceType: "REVERSAL" } })).toBe(0);
    vi.spyOn(CouponVaultService, "checkTransferStatus").mockResolvedValue({ success: true, processed: true, status: "SUCCESS" });
    expect((await reconcileUnconfirmedTransfer(r.id)).resolution).toBe("COMPLETED");
  });
});

describe("admin financial MFA", () => {
  it("legacy verification stamps only the authenticated session", async () => {
    const u = await createTestUser(), secret = generateSecret();
    await prisma.profile.update({ where: { userId: u.id }, data: { twoFactorEnabled: true, twoFactorSecret: secret } });
    await prisma.loginSession.createMany({ data: [
      { userId: u.id, tokenHash: hashToken(u.token), expiresAt: new Date(Date.now() + 60_000) },
      { userId: u.id, tokenHash: hashToken("different-device"), expiresAt: new Date(Date.now() + 60_000) },
    ] });
    const token = await generate({ secret, crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });
    const app = buildApp();
    try {
      const response = await app.inject({ method: "POST", url: "/api/security/2fa/verify-login",
        headers: { authorization: `Bearer ${u.token}` }, payload: { userId: u.id, token } });
      expect(response.statusCode).toBe(200);
      expect((await prisma.loginSession.findUniqueOrThrow({ where: { tokenHash: hashToken(u.token) } })).mfaVerifiedAt).not.toBeNull();
      expect((await prisma.loginSession.findUniqueOrThrow({ where: { tokenHash: hashToken("different-device") } })).mfaVerifiedAt).toBeNull();
    } finally { await app.close(); }
  });
  it("legacy verification cannot revive a revoked session", async () => {
    const u = await createTestUser(), secret = generateSecret();
    await prisma.profile.update({ where: { userId: u.id }, data: { twoFactorEnabled: true, twoFactorSecret: secret } });
    await prisma.loginSession.create({ data: { userId: u.id, tokenHash: hashToken(u.token), expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() } });
    const token = await generate({ secret, crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });
    const app = buildApp();
    try {
      const response = await app.inject({ method: "POST", url: "/api/security/2fa/verify-login",
        headers: { authorization: `Bearer ${u.token}` }, payload: { userId: u.id, token } });
      expect(response.statusCode).toBe(401);
      expect((await prisma.loginSession.findUniqueOrThrow({ where: { tokenHash: hashToken(u.token) } })).revokedAt).not.toBeNull();
    } finally { await app.close(); }
  });
  it("legacy MFA verification cannot verify a different user's session", async () => {
    const victim = await createTestUser(), other = await createTestUser();
    const secret = generateSecret();
    await prisma.profile.update({ where: { userId: victim.id }, data: { twoFactorEnabled: true } });
    await prisma.profile.update({ where: { userId: other.id }, data: { twoFactorEnabled: true, twoFactorSecret: secret } });
    await prisma.loginSession.create({ data: { userId: victim.id, tokenHash: hashToken(victim.token), expiresAt: new Date(Date.now() + 60_000) } });
    const token = await generate({ secret, crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });
    const app = buildApp();
    try {
      const response = await app.inject({ method: "POST", url: "/api/security/2fa/verify-login",
        headers: { authorization: `Bearer ${victim.token}` }, payload: { userId: other.id, token } });
      expect(response.statusCode).toBe(403);
      expect((await prisma.loginSession.findUniqueOrThrow({ where: { tokenHash: hashToken(victim.token) } })).mfaVerifiedAt).toBeNull();
    } finally { await app.close(); }
  });
  it.each(["unenrolled", "pending", "stale", "fresh"])("cancellation/refund enforces %s MFA", async mode => {
    const u = await createTestUser({ role: "ADMIN" });
    if (mode !== "unenrolled") {
      await prisma.profile.update({ where: { userId: u.id }, data: { twoFactorEnabled: true } });
      await prisma.loginSession.create({ data: { userId: u.id, tokenHash: hashToken(u.token),
        expiresAt: new Date(Date.now() + 60_000),
        mfaVerifiedAt: mode === "pending" ? null : new Date(Date.now() - (mode === "stale" ? 20 * 60_000 : 0)) } });
    }
    const cancel = vi.spyOn(engine, "cancelTournamentWithRefunds").mockResolvedValue(undefined as any);
    const app = Fastify(); await app.register(adminTournamentsRoutes);
    try {
      const response = await app.inject({ method: "POST", url: "/api/admin/tournaments/test/cancel",
        headers: { authorization: `Bearer ${u.token}` }, payload: { reason: "controlled test" } });
      expect(response.statusCode).toBe(mode === "fresh" ? 200 : 403);
      expect(cancel).toHaveBeenCalledTimes(mode === "fresh" ? 1 : 0);
    } finally { await app.close(); }
  });
  it("financial/security admin mutation inventory retains fresh-MFA gates", () => {
    const files = ["admin", "adminGames", "adminKyc", "adminEnterprise", "adminTournaments"];
    const exempt = /start-review|errors\/|announcements|tickets\/|emails\/|analytics\/validate|integrity-alerts|reports\/generate/;
    let count = 0;
    for (const file of files) {
      const source = fs.readFileSync(new URL(`../../routes/${file}.ts`, import.meta.url), "utf8");
      for (const route of source.matchAll(/app\.(post|put|patch|delete)\("([^"]+)",\s*\{([^\n]+)\}/g)) {
        if (exempt.test(route[2])) continue;
        expect(route[3], route[2]).toContain("requireMfa"); count++;
      }
    }
    expect(count).toBeGreaterThan(40);
  });
});

describe("configured proxy boundary", () => {
  it("trusts only the configured hop count for client IP limits", async () => {
    const previous = { hops: env.TRUST_PROXY_HOPS, cidrs: env.TRUST_PROXY_CIDRS };
    env.TRUST_PROXY_HOPS = 1;
    env.TRUST_PROXY_CIDRS = "192.0.2.10/32";
    const app = buildApp();
    app.get("/__test/client-ip", request => ({ ip: request.ip }));
    try {
      const response = await app.inject({ url: "/__test/client-ip", remoteAddress: "192.0.2.10",
        headers: { "x-forwarded-for": "198.51.100.99, 203.0.113.4" } });
      expect(response.statusCode).toBe(200);
      expect(response.json().ip).toBe("203.0.113.4");
    } finally { await app.close(); env.TRUST_PROXY_HOPS = previous.hops; env.TRUST_PROXY_CIDRS = previous.cidrs; }
  });
  it("ignores forwarded IPs when directly deployed", async () => {
    const previous = { hops: env.TRUST_PROXY_HOPS, cidrs: env.TRUST_PROXY_CIDRS };
    env.TRUST_PROXY_HOPS = 0;
    env.TRUST_PROXY_CIDRS = "192.0.2.10/32";
    const app = buildApp();
    app.get("/__test/client-ip", request => ({ ip: request.ip }));
    try {
      const response = await app.inject({ url: "/__test/client-ip", remoteAddress: "192.0.2.10",
        headers: { "x-forwarded-for": "203.0.113.4" } });
      expect(response.json().ip).toBe("192.0.2.10");
    } finally { await app.close(); env.TRUST_PROXY_HOPS = previous.hops; env.TRUST_PROXY_CIDRS = previous.cidrs; }
  });
  it.each(["", "10.0.0.0/8"])("does not trust a spoofed header from an unapproved peer (%s)", async cidrs => {
    const previous = { hops: env.TRUST_PROXY_HOPS, cidrs: env.TRUST_PROXY_CIDRS };
    env.TRUST_PROXY_HOPS = 1; env.TRUST_PROXY_CIDRS = cidrs;
    const app = buildApp(); app.get("/__test/client-ip", request => ({ ip: request.ip }));
    try {
      const response = await app.inject({ url: "/__test/client-ip", remoteAddress: "192.0.2.10",
        headers: { "x-forwarded-for": "203.0.113.4" } });
      expect(response.json().ip).toBe("192.0.2.10");
    } finally { await app.close(); env.TRUST_PROXY_HOPS = previous.hops; env.TRUST_PROXY_CIDRS = previous.cidrs; }
  });
});

describe("shared PostgreSQL limits", () => {
  it("two instances and a recreated store consume the same atomic budget", async () => {
    const key = crypto.randomUUID();
    const a = new PostgresRateLimitStore(), b = new PostgresRateLimitStore();
    const hit = (store: PostgresRateLimitStore) => new Promise<number>((resolve, reject) => {
      store.incr(key, (error, result) => error ? reject(error) : resolve(result!.current));
    });
    const counts = await Promise.all([hit(a), hit(b), hit(a), hit(b), hit(a)]);
    expect(counts.sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
    expect(await hit(new PostgresRateLimitStore())).toBe(6);
    const rows = await prisma.rateLimitWindow.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].key).not.toContain(key);
  });
});

describe("disposable database boundary", () => {
  it.each([undefined, "postgresql://user:dummy@production.example/app_test", "postgresql://user:dummy@localhost/app",
    "postgresql://user:dummy@localhost/evil%22_test", "postgresql://user:dummy@localhost/app_test?schema=private"])("rejects unsafe URL %s before connecting", value => {
    expect(() => validateTestDatabaseUrl(value)).toThrow();
  });
  it("accepts an explicit local disposable database", () => {
    expect(validateTestDatabaseUrl("postgresql://test:dummy@127.0.0.1:5541/app_test")).toContain("app_test");
  });
});

describe("migration drift rejection", () => {
  const guard = fs.readFileSync(new URL("../../../../../packages/db/prisma/migrations/20261003000000_shared_security_limits_and_schema_guard/migration.sql", import.meta.url), "utf8").split('CREATE TABLE "RateLimitWindow"')[0];
  it.each([
    `ALTER TABLE "ReferralRiskEvent" ALTER COLUMN "status" DROP DEFAULT; ALTER TABLE "ReferralRiskEvent" ALTER COLUMN "status" TYPE INTEGER USING 0`,
    `ALTER TABLE "ReferralRiskEvent" ALTER COLUMN "status" DROP NOT NULL`,
    `ALTER TABLE "ReferralRiskEvent" ALTER COLUMN "status" SET DEFAULT 'WRONG'`,
    `ALTER TABLE "ReferralRiskEvent" DROP CONSTRAINT "ReferralRiskEvent_userId_fkey"`,
    `DROP INDEX "AffiliateCommission_sourceType_sourceId_key"`,
    `DROP INDEX "ReferralRiskEvent_status_idx"; CREATE INDEX "ReferralRiskEvent_status_idx" ON "ReferralRiskEvent"("severity")`,
    `ALTER TYPE "NotificationType" ADD VALUE 'UNEXPECTED_AUDIT_VALUE'`,
  ])("rejects definition drift and rolls back: %s", async change => {
    await expect(prisma.$transaction(async tx => {
      for (const statement of change.split(";")) await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe(guard);
    })).rejects.toThrow(/Schema drift/);
  });
});

 describe("trusted email verification", () => {
  it("does not trust user-editable metadata", async () => {
    expect(await hasVerifiedEmail({ sub: "user" }, "dummy-token", { url: "http://localhost:59999" })).toBe(false);
  });
  it("supports verified Supabase users without a top-level JWT claim", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "user", email_confirmed_at: "2026-10-03" })));
    expect(await hasVerifiedEmail({ sub: "user" }, "dummy-token", { url: "http://localhost:59999", key: "dummy-test-key" })).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
  it("rejects a provider user record for another identity", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "other", email_confirmed_at: "2026-10-03" })));
    expect(await hasVerifiedEmail({ sub: "user" }, "dummy-token", { url: "http://localhost:59999", key: "dummy-test-key" })).toBe(false);
  });
});
