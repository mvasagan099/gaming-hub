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
 * Coupon redemption saga. Only the creator may make the external request.
 * A persisted in-flight saga may have committed externally before a crash;
 * without provider ownership proof it must stay held, never blindly retried.
 * Confirmed local recovery locks the saga and uses its ID as the ledger PK.
 */
export async function redeemCoupon(
  userId: string,
  code: string,
  metaParams?: { ipAddress?: string; device?: string },
) {
  const { createHash } = await import("node:crypto");
  const codeUpper = code.trim().toUpperCase();
  const couponCodeHash = createHash("sha256").update(codeUpper).digest("hex");
  let saga = await prisma.couponRedemption.findFirst({ where: { couponCodeHash }, orderBy: { createdAt: "desc" } });
  const reply = (value: number) => ({ ok: true, success: true, value, code: codeUpper, message: "Coupon redeemed successfully" });
  // The immutable deposit ledger is also the durable affiliate repair source.
  const dispatchDeposit = async (couponId: string) => {
    const deposits = await prisma.transaction.findMany({ where: { userId, type: "CREDIT", walletType: "MAIN", referenceType: "DEPOSIT", referenceId: couponId }, take: 2 });
    if (deposits.length !== 1) throw new AppError("COUPON_CREDIT_FAILED", "Coupon ledger requires reconciliation", 500);
    const { WalletTransactionService } = await import("./walletTransactionService");
    await WalletTransactionService.onDepositCompleted({ transactionId: deposits[0].id });
  };
  if (saga) {
    if (saga.userId !== userId) throw new AppError("COUPON_ALREADY_USED", "This coupon has already been redeemed.", 409);
    if (saga.sagaStatus === "COMPLETED") {
      await dispatchDeposit(saga.couponId);
      return { ...reply(saga.value), message: "Coupon already redeemed — balance is up to date." };
    }
    if (saga.sagaStatus === "FAILED") throw new AppError("COUPON_CREDIT_FAILED", "Coupon redemption failed. Contact support.", 500);
    if (!saga.externalConfirmedAt && saga.sagaStatus !== "EXTERNAL_CONFIRMED") {
      await prisma.couponRedemption.updateMany({ where: { id: saga.id, sagaStatus: "PENDING", externalConfirmedAt: null }, data: { sagaStatus: "NEEDS_RECONCILIATION" } });
      throw new AppError("COUPON_CREDIT_FAILED", "Redemption outcome requires provider reconciliation. Contact support with reference: " + saga.id, 503);
    }
  } else {
    const verified = await CouponVaultService.verifyCoupon(codeUpper, userId);
    const amount = Number(verified.amount), couponId = verified.couponId;
    if (!Number.isSafeInteger(amount) || amount <= 0 || !couponId) throw new AppError("COUPON_INVALID", "This coupon has no valid value", 400);
    await prisma.coupon.upsert({ where: { code: codeUpper }, update: {}, create: {
      id: couponId, code: codeUpper, title: "CouponVault Promotion", discountType: "FIXED", discountValue: amount,
      maxUses: 1, usedCount: 0, validFrom: new Date(Date.now() - 3600000), validUntil: new Date(Date.now() + 86400000 * 365), status: "ACTIVE",
    } });
    try {
      saga = await prisma.couponRedemption.create({ data: { couponId, userId, value: amount, couponCodeHash, externalTxId: `CPN-${couponId}`, sagaStatus: "PENDING" } });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "P2002") throw new AppError("COUPON_ALREADY_USED", "This coupon is already being redeemed.", 409);
      throw err;
    }
    try {
      await CouponVaultService.redeemCoupon({ couponId, userId, walletTransactionId: saga.externalTxId!, ipAddress: metaParams?.ipAddress, device: metaParams?.device });
      saga = await prisma.couponRedemption.update({ where: { id: saga.id }, data: { sagaStatus: "EXTERNAL_CONFIRMED", externalConfirmedAt: new Date() } });
    } catch (err: unknown) {
      const e = err as AppError;
      // Timeout, 5xx, malformed acknowledgement, and generic 409 cannot prove
      // nonprocessing. Only explicit coupon validation rejection is terminal.
      const definitive = e.code === "COUPON_INVALID" && e.statusCode === 400 && (e.details as { definitiveNonProcessing?: boolean } | undefined)?.definitiveNonProcessing === true;
      await prisma.couponRedemption.updateMany({ where: { id: saga.id, sagaStatus: { in: ["PENDING", "NEEDS_RECONCILIATION"] }, externalConfirmedAt: null }, data: {
        sagaStatus: definitive ? "FAILED" : "NEEDS_RECONCILIATION",
        failureReason: definitive ? "Provider rejected redemption" : "Provider outcome unconfirmed; ownership proof required",
      } }).catch(() => undefined);
      throw err;
    }
  }
  const sagaId = saga.id, couponId = saga.couponId, amount = saga.value;
  let credited = false;
  try {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "CouponRedemption" WHERE "id" = ${sagaId} FOR UPDATE`;
      const current = await tx.couponRedemption.findUniqueOrThrow({ where: { id: sagaId } });
      if (current.userId !== userId || current.couponId !== couponId || current.value !== amount) throw new AppError("COUPON_CREDIT_FAILED", "Coupon identity mismatch", 409);
      if (current.sagaStatus === "COMPLETED") return;
      if (!current.externalConfirmedAt && current.sagaStatus !== "EXTERNAL_CONFIRMED") throw new AppError("COUPON_CREDIT_FAILED", "Provider confirmation required", 503);
      const ledger = await tx.transaction.findUnique({ where: { id: sagaId } });
      if (ledger) {
        if (ledger.userId !== userId || ledger.type !== "CREDIT" || ledger.walletType !== "MAIN" || ledger.referenceType !== "DEPOSIT" || ledger.referenceId !== couponId || ledger.amount !== amount) throw new AppError("COUPON_CREDIT_FAILED", "Coupon ledger identity mismatch", 409);
      } else {
        await applyTransaction(tx, userId, amount, "DEPOSIT", couponId, { code: codeUpper, couponId, provider: "COUPONVAULT", source: "COUPONVAULT", walletTransactionId: current.externalTxId, sagaId }, "MAIN", sagaId);
        await tx.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
        credited = true;
      }
      await tx.couponRedemption.update({ where: { id: sagaId }, data: { sagaStatus: "COMPLETED", completedAt: new Date(), failureReason: null } });
    });
  } catch (err) {
    await prisma.couponRedemption.updateMany({ where: { id: sagaId, sagaStatus: { not: "COMPLETED" } }, data: { sagaStatus: "NEEDS_RECONCILIATION", failureReason: "Confirmed external redemption; local credit requires recovery" } }).catch(() => undefined);
    throw new AppError("COUPON_CREDIT_FAILED", "Wallet credit requires recovery. Reference: " + sagaId, 500);
  }
  await dispatchDeposit(couponId);
  if (credited) {
    const { WalletSyncService } = await import("./walletSyncService");
    const { getWallet } = await import("./wallet");
    const wallet = await getWallet(userId);
    WalletSyncService.emitWalletUpdate({ userId, balance: wallet.balance, bonusBalance: wallet.bonusBalance, lockedBalance: wallet.lockedBalance, rewardBalance: wallet.rewardBalance, cashbackBalance: wallet.cashbackBalance, type: "CREDIT", amount });
    audit({ actorType: "user", actorId: userId, action: "coupon.redeemed", category: "wallet", targetType: "coupon", targetId: couponId, meta: { value: amount, provider: "COUPONVAULT", sagaId } });
    await createNotification(userId, "COUPON", `Coupon redeemed: ${codeUpper}`, `You received ${amount} coins in your main wallet`, { couponId, value: amount });
  }
  return reply(amount);
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
