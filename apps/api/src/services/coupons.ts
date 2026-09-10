import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type { CouponStatus, CouponDiscountType } from "@gaming-hub/shared";
import { applyTransaction } from "./wallet";
import { createNotification } from "./notifications";
import { audit } from "./audit";
import { CouponVaultService } from "./couponVaultService";

export interface CreateCouponInput {
  code: string;
  title: string;
  description?: string;
  discountType: CouponDiscountType;
  discountValue: number;
  maxUses: number;
  minWager?: number;
  maxRedeemValue?: number | null;
  gameId?: string | null;
  validFrom: string;
  validUntil: string;
}

export async function listCoupons(page: number, pageSize: number, status?: CouponStatus) {
  const where = status ? { status } : {};
  const [items, total] = await Promise.all([
    prisma.coupon.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.coupon.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getCoupon(code: string) {
  const coupon = await prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!coupon) throw new AppError("COUPON_INVALID", "Coupon not found", 404);
  return coupon;
}

export async function createCoupon(input: CreateCouponInput, createdBy: string | null) {
  if (input.discountValue <= 0) {
    throw new AppError("VALIDATION_ERROR", "Discount value must be positive", 422);
  }
  const validFrom = new Date(input.validFrom);
  const validUntil = new Date(input.validUntil);
  if (validUntil <= validFrom) {
    throw new AppError("VALIDATION_ERROR", "validUntil must be after validFrom", 422);
  }

  const code = input.code.trim().toUpperCase();
  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) {
    throw new AppError("VALIDATION_ERROR", "Coupon code already exists", 422);
  }

  const coupon = await prisma.coupon.create({
    data: {
      code,
      title: input.title,
      description: input.description ?? null,
      discountType: input.discountType,
      discountValue: input.discountValue,
      maxUses: input.maxUses,
      minWager: input.minWager ?? 0,
      maxRedeemValue: input.maxRedeemValue ?? null,
      gameId: input.gameId ?? null,
      validFrom,
      validUntil,
      createdBy,
    },
  });

  audit({
    actorType: "user",
    actorId: createdBy,
    action: "admin.coupon.created",
    category: "admin",
    targetType: "coupon",
    targetId: coupon.id,
    meta: { code },
  });
  return coupon;
}

export async function updateCoupon(id: string, input: Partial<CreateCouponInput>, updatedBy: string | null) {
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Coupon not found", 404);

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description ?? null;
  if (input.discountType !== undefined) data.discountType = input.discountType;
  if (input.discountValue !== undefined) data.discountValue = input.discountValue;
  if (input.maxUses !== undefined) data.maxUses = input.maxUses;
  if (input.minWager !== undefined) data.minWager = input.minWager;
  if (input.maxRedeemValue !== undefined) data.maxRedeemValue = input.maxRedeemValue ?? null;
  if (input.gameId !== undefined) data.gameId = input.gameId ?? null;
  if (input.validFrom !== undefined) data.validFrom = new Date(input.validFrom);
  if (input.validUntil !== undefined) data.validUntil = new Date(input.validUntil);

  const coupon = await prisma.coupon.update({ where: { id }, data });
  audit({
    actorType: "user",
    actorId: updatedBy,
    action: "admin.coupon.updated",
    category: "admin",
    targetType: "coupon",
    targetId: id,
    meta: { code: existing.code },
  });
  return coupon;
}

export async function setCouponStatus(id: string, status: CouponStatus, updatedBy: string | null) {
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Coupon not found", 404);
  const coupon = await prisma.coupon.update({ where: { id }, data: { status } });
  audit({
    actorType: "user",
    actorId: updatedBy,
    action: "admin.coupon.status.changed",
    category: "admin",
    targetType: "coupon",
    targetId: id,
    meta: { code: existing.code, status },
  });
  return coupon;
}

export async function deleteCoupon(id: string, deletedBy: string | null) {
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Coupon not found", 404);
  await prisma.coupon.delete({ where: { id } });
  audit({
    actorType: "user",
    actorId: deletedBy,
    action: "admin.coupon.deleted",
    category: "admin",
    targetType: "coupon",
    targetId: id,
    meta: { code: existing.code },
  });
  return { ok: true };
}

function computeValue(coupon: { discountType: CouponDiscountType; discountValue: number; minWager: number; maxRedeemValue: number | null }): number {
  if (coupon.discountType === "FIXED") return coupon.discountValue;
  const base = Math.floor((coupon.minWager * coupon.discountValue) / 100);
  return coupon.maxRedeemValue != null ? Math.min(base, coupon.maxRedeemValue) : base;
}

/**
 * Verifies a coupon code against CouponVault.
 */
export async function verifyCoupon(code: string, userId: string) {
  return CouponVaultService.verifyCoupon(code, userId);
}

/**
 * Redeems a coupon using CouponVault as the central authority.
 * Flow:
 * 1. Verify coupon validity with CouponVault.
 * 2. Guard against local duplicate redemption.
 * 3. Atomically redeem on CouponVault FIRST (CouponVault locks with SELECT ... FOR UPDATE).
 * 4. Credit Gaming Hub MAIN wallet balance via applyTransaction ("COUPON").
 * 5. Record local redemption and transaction ledger.
 * 6. Emit real-time wallet synchronization event.
 */
export async function redeemCoupon(
  userId: string,
  code: string,
  metaParams?: { ipAddress?: string; device?: string },
) {
  const codeUpper = code.trim().toUpperCase();

  // STEP 1: Verify coupon exists and is valid on CouponVault
  const verifyData = await CouponVaultService.verifyCoupon(codeUpper, userId);
  const amount = Number(verifyData.amount);
  const couponId = verifyData.couponId;

  if (!amount || amount <= 0) {
    throw new AppError("COUPON_INVALID", "This coupon has no value", 400);
  }

  // Check if already redeemed locally by this user
  const alreadyUsed = await prisma.couponRedemption.findUnique({
    where: { couponId_userId: { couponId, userId } },
  });
  if (alreadyUsed) {
    throw new AppError("COUPON_ALREADY_USED", "You have already used this coupon", 400);
  }

  // STEP 2: Atomically redeem on CouponVault FIRST.
  const walletTransactionId = `CPN-${couponId}`;
  await CouponVaultService.redeemCoupon({
    couponId,
    userId,
    walletTransactionId,
    ipAddress: metaParams?.ipAddress,
    device: metaParams?.device,
  });

  // STEP 3: Credit Gaming Hub MAIN wallet locally inside a transaction
  try {
    await prisma.$transaction(async (tx) => {
      // Upsert shadow coupon record to fulfill relational integrity and history
      await tx.coupon.upsert({
        where: { code: codeUpper },
        update: { usedCount: { increment: 1 } },
        create: {
          id: couponId,
          code: codeUpper,
          title: "CouponVault Promotion",
          discountType: "FIXED",
          discountValue: amount,
          maxUses: 1,
          usedCount: 1,
          validFrom: new Date(Date.now() - 3600000),
          validUntil: new Date(Date.now() + 86400000 * 365),
          status: "ACTIVE",
        },
      });

      // Record redemption (unique constraint on [couponId, userId] guarantees single credit)
      await tx.couponRedemption.create({
        data: {
          couponId,
          userId,
          value: amount,
        },
      });

      // Credit MAIN wallet balance so winnings from gameplay are withdrawable
      await applyTransaction(
        tx,
        userId,
        amount,
        "COUPON",
        couponId,
        {
          code: codeUpper,
          couponId,
          provider: "COUPONVAULT",
          source: "COUPONVAULT",
          walletTransactionId,
        },
        "MAIN",
      );
    });
  } catch (err: any) {
    // Unique constraint violation means coupon was already credited locally (race condition safety)
    if (err?.code === "P2002" || err?.message?.includes("unique")) {
      console.warn("WARN: Duplicate coupon credit caught by unique constraint", { userId, couponId, codeUpper });
      return { ok: true, success: true, value: amount, code: codeUpper, message: "Coupon already redeemed — balance is up to date." };
    }
    console.error("CRITICAL: Coupon redeemed on CouponVault but local wallet credit failed", { userId, couponId, err });
    throw new AppError("COUPON_CREDIT_FAILED", "Redemption recorded but wallet credit failed. Please contact support with reference: " + walletTransactionId, 500);
  }

  // STEP 4: Real-time wallet synchronization
  try {
    const { WalletSyncService } = await import("./walletSyncService");
    const { getWallet } = await import("./wallet");
    const updatedWallet = await getWallet(userId);
    WalletSyncService.emitWalletUpdate({
      userId,
      balance: updatedWallet.balance,
      bonusBalance: updatedWallet.bonusBalance,
      lockedBalance: updatedWallet.lockedBalance,
      rewardBalance: updatedWallet.rewardBalance,
      cashbackBalance: updatedWallet.cashbackBalance,
      type: "CREDIT",
      amount,
    });
  } catch (syncErr) {
    console.warn("Wallet sync event emission failed:", syncErr);
  }

  audit({
    actorType: "user",
    actorId: userId,
    action: "coupon.redeemed",
    category: "wallet",
    targetType: "coupon",
    targetId: couponId,
    meta: { code: codeUpper, value: amount, provider: "COUPONVAULT" },
  });

  await createNotification(
    userId,
    "COUPON",
    `Coupon redeemed: ${codeUpper}`,
    `You received ${amount} coins in your main wallet`,
    { couponId, value: amount },
  );

  return { ok: true, success: true, value: amount, code: codeUpper, message: "Coupon redeemed successfully" };
}


export async function listMyRedemptions(userId: string, page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    prisma.couponRedemption.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { coupon: true },
    }),
    prisma.couponRedemption.count({ where: { userId } }),
  ]);

  return {
    items: items.map((r) => ({
      id: r.id,
      value: r.value,
      createdAt: r.createdAt.toISOString(),
      coupon: {
        code: r.coupon.code,
        title: r.coupon.title,
        discountType: r.coupon.discountType,
        discountValue: r.coupon.discountValue,
      },
    })),
    total,
    page,
    pageSize,
  };
}
