import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type { CouponStatus, CouponDiscountType } from "@gaming-hub/shared";
import { applyTransaction } from "./wallet";
import { createNotification } from "./notifications";
import { audit } from "./audit";

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
 * Redeems a coupon, crediting the bonus wallet. Validates active status, date
 * window, global usage cap, and per-user uniqueness. Rewards are settings- and
 * feature-flag-gated by the caller.
 */
export async function redeemCoupon(userId: string, code: string) {
  const coupon = await getCoupon(code);

  if (coupon.status !== "ACTIVE") {
    throw new AppError("COUPON_INVALID", "This coupon is not active", 400);
  }
  const now = new Date();
  if (now < coupon.validFrom || now > coupon.validUntil) {
    throw new AppError("COUPON_EXPIRED", "This coupon has expired", 400);
  }
  if (coupon.usedCount >= coupon.maxUses) {
    throw new AppError("COUPON_MAX_USES_REACHED", "This coupon has reached its usage limit", 400);
  }

  const alreadyUsed = await prisma.couponRedemption.findUnique({
    where: { couponId_userId: { couponId: coupon.id, userId } },
  });
  if (alreadyUsed) {
    throw new AppError("COUPON_ALREADY_USED", "You have already used this coupon", 400);
  }

  const value = computeValue(coupon);
  if (value <= 0) {
    throw new AppError("COUPON_INVALID", "This coupon has no value", 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    });
    await tx.couponRedemption.create({ data: { couponId: coupon.id, userId, value } });
    await applyTransaction(tx, userId, value, "COUPON", coupon.id, { code: coupon.code }, "BONUS");
  });

  audit({
    actorType: "user",
    actorId: userId,
    action: "coupon.redeemed",
    category: "wallet",
    targetType: "coupon",
    targetId: coupon.id,
    meta: { code: coupon.code, value },
  });

  await createNotification(userId, "COUPON", `Coupon redeemed: ${coupon.code}`,
    `You received ${value} bonus coins`, { couponId: coupon.id, value });

  return { ok: true, value, code: coupon.code };
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
