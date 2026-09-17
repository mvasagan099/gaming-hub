import { beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";
import { buildApp } from "../../app";
import { createTestUser } from "../../../test/helpers";
import { CouponVaultService } from "../../services/couponVaultService";
import { hashToken } from "../../services/sessions";

describe("wallet HTTP routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  async function request(
    method: "GET" | "POST",
    url: string,
    body?: Record<string, unknown>,
    token?: string,
  ): Promise<Awaited<ReturnType<FastifyInstance["inject"]>>> {
    return app.inject({
      method,
      url,
      payload: body,
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
  }

  async function enrollFreshAdminMfa(admin: { id: string; token: string }) {
    await prisma.profile.update({
      where: { userId: admin.id },
      data: { twoFactorEnabled: true },
    });
    await prisma.loginSession.upsert({
      where: { tokenHash: hashToken(admin.token) },
      create: {
        userId: admin.id,
        tokenHash: hashToken(admin.token),
        expiresAt: new Date(Date.now() + 60_000),
        mfaVerifiedAt: new Date(),
      },
      update: { revokedAt: null, isCurrent: true, mfaVerifiedAt: new Date() },
    });
  }

  it("rejects unauthenticated wallet access", async () => {
    const res = await request("GET", "/api/wallet");
    expect(res.statusCode).toBe(401);
  });

  it("issues a withdrawal OTP", async () => {
    const user = await createTestUser();
    const res = await request("POST", "/api/wallet/otp", {}, user.token);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.debugCode).toMatch(/^\d{6}$/);
  });

  it("blocks direct deposit requests because coupons are the MAIN funding path", async () => {
    const user = await createTestUser();

    const created = await request(
      "POST",
      "/api/wallet/deposits",
      { amount: 1000, method: "MANUAL" },
      user.token,
    );
    expect(created.statusCode).toBe(403);
    expect(created.json().error.code).toBe("DEPOSITS_DISABLED");
  });

  it("walks a withdrawal request through to rejection", async () => {
    const user = await createTestUser();
    const admin = await createTestUser({ role: "ADMIN" });
    await enrollFreshAdminMfa(admin);

    const otp = await request("POST", "/api/wallet/otp", {}, user.token);
    const { debugCode } = otp.json();
    await prisma.wallet.update({ where: { userId: user.id }, data: { balance: 5000 } });
    vi.spyOn(CouponVaultService, "transferToCouponWallet").mockResolvedValue({ success: true });

    const created = await request(
      "POST",
      "/api/wallet/withdrawals",
      { amount: 200, otp: debugCode },
      user.token,
    );
    expect(created.statusCode).toBe(200);
    expect(created.json().status).toBe("PENDING");

    const rejected = await request(
      "POST",
      `/api/admin/wallet/requests/${created.json().id}/reject`,
      { reason: "verification required" },
      admin.token,
    );
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().request.status).toBe("REJECTED");

    const wallet = await request("GET", "/api/wallet", undefined, user.token);
    expect(wallet.json().balance).toBe(5000);
    vi.restoreAllMocks();
  });

  it("rejects a withdrawal with a bad OTP", async () => {
    const user = await createTestUser();
    await request("POST", "/api/wallet/otp", {}, user.token);

    const res = await request(
      "POST",
      "/api/wallet/withdrawals",
      { amount: 100, otp: "999999" },
      user.token,
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("OTP_INVALID");
  });

  it("enforces admin permissions on wallet endpoints", async () => {
    const user = await createTestUser();

    const list = await request("GET", "/api/admin/wallet/requests", undefined, user.token);
    expect(list.statusCode).toBe(403);

    const approve = await request(
      "POST",
      "/api/admin/wallet/requests/some-id/approve",
      {},
      user.token,
    );
    expect(approve.statusCode).toBe(403);
  });

  it("prevents a user from reading another user's request", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const created = await prisma.walletRequest.create({
      data: { userId: a.id, kind: "WITHDRAWAL", amount: 100 },
    });

    const res = await request("GET", `/api/wallet/requests/${created.id}`, undefined, b.token);
    expect(res.statusCode).toBe(404);
  });

  it("freezes and unfreezes a wallet via admin", async () => {
    const user = await createTestUser();
    const admin = await createTestUser({ role: "ADMIN" });
    await enrollFreshAdminMfa(admin);

    const frozen = await request(
      "POST",
      `/api/admin/users/${user.id}/wallet/freeze`,
      { reason: "suspicious activity" },
      admin.token,
    );
    expect(frozen.statusCode).toBe(200);
    expect(frozen.json().isFrozen).toBe(true);

    const wallet = await request("GET", "/api/wallet", undefined, user.token);
    expect(wallet.json().isFrozen).toBe(true);

    const unfrozen = await request(
      "POST",
      `/api/admin/users/${user.id}/wallet/unfreeze`,
      {},
      admin.token,
    );
    expect(unfrozen.statusCode).toBe(200);
    expect(unfrozen.json().isFrozen).toBe(false);
  });

  it("verifies coupon redemption credits the MAIN wallet", async () => {
    const user = await createTestUser();
    const coupon = await prisma.coupon.create({
      data: {
        code: `C${Date.now().toString().slice(-8)}`,
        title: "Bonus",
        discountType: "FIXED",
        discountValue: 250,
        maxUses: 50,
        validFrom: new Date(Date.now() - 60_000),
        validUntil: new Date(Date.now() + 86_400_000),
        status: "ACTIVE",
      },
    });

    // Keep this route test deterministic while the CouponVault integration is
    // exercised separately by its integration suite.
    vi.spyOn(CouponVaultService, "verifyCoupon").mockResolvedValue({
      success: true,
      couponId: coupon.id,
      amount: 250,
      currency: "INR",
      status: "ACTIVE",
    });
    vi.spyOn(CouponVaultService, "redeemCoupon").mockResolvedValue({ success: true });

    const res = await request(
      "POST",
      "/api/coupons/redeem",
      { code: coupon.code },
      user.token,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe(250);

    const wallet = await request("GET", "/api/wallet", undefined, user.token);
    expect(wallet.json().balance).toBe(250);

    const redemption = await prisma.couponRedemption.findFirst({ where: { userId: user.id } });
    expect(redemption).not.toBeNull();
    expect(redemption!.couponId).toBe(coupon.id);
    vi.restoreAllMocks();
  });
});
