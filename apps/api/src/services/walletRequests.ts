import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { prisma, Prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type {
  WalletRequest,
  WalletRequestKind,
  WalletRequestStatus,
} from "@gaming-hub/shared";
import { applyTransaction, getWallet } from "./wallet";
import { audit } from "./audit";
import { createNotification } from "./notifications";
import { getCategorySettings } from "./settings";
import { notifyUserSocket } from "./socketBridge";

const OTP_PURPOSE = "WALLET_WITHDRAWAL";

// ---------------------------------------------------------------------------
// Row locking helpers
// ---------------------------------------------------------------------------

/**
 * Takes a `SELECT ... FOR UPDATE` lock on the wallet row so concurrent
 * decisions serialise at the database instead of racing in application code.
 * The lock is held until the enclosing transaction commits or rolls back.
 */
async function lockWalletRow(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ userId: string }>>(
    Prisma.sql`SELECT "userId" FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`,
  );
  if (rows.length === 0) {
    throw new AppError("NOT_FOUND", "Wallet not found", 404);
  }
}

async function lockWalletRequestRow(
  tx: Prisma.TransactionClient,
  requestId: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "WalletRequest" WHERE "id" = ${requestId} FOR UPDATE`,
  );
}

async function assertWalletNotFrozen(userId: string): Promise<void> {
  const wallet = await getWallet(userId);
  if (wallet.isFrozen) {
    throw new AppError(
      "WALLET_FROZEN",
      wallet.frozenReason
        ? `Wallet is frozen: ${wallet.frozenReason}`
        : "Wallet is frozen",
      403,
    );
  }
}

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

function hashOtp(code: string, salt: string): string {
  return createHash("sha256").update(`${code}:${salt}`).digest("hex");
}

export interface WalletOtpResult {
  ok: true;
  expiresAt: string;
  /** Present only outside production so devs and tests can complete the flow. */
  debugCode?: string;
}

/**
 * Issues a fresh one-time code for wallet withdrawals. Previous unconsumed
 * codes are invalidated, the code is stored hashed, and (in production) the
 * plaintext is only delivered via the email transport. Outside production the
 * code is returned as `debugCode` so the flow is usable without SMTP.
 */
export async function requestWithdrawalOtp(userId: string): Promise<WalletOtpResult> {
  await assertWalletNotFrozen(userId);

  const settings = await getCategorySettings("wallet");
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const salt = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + settings.otpExpiryMinutes * 60_000);

  await prisma.$transaction([
    prisma.walletOtp.updateMany({
      where: { userId, purpose: OTP_PURPOSE, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.walletOtp.create({
      data: {
        userId,
        purpose: OTP_PURPOSE,
        codeHash: `${salt}:${hashOtp(code, salt)}`,
        expiresAt,
      },
    }),
  ]);

  audit({
    actorType: "user",
    actorId: userId,
    action: "wallet.otp.issued",
    category: "wallet",
    targetType: "user",
    targetId: userId,
    meta: { purpose: OTP_PURPOSE, expiresAt: expiresAt.toISOString() },
  });

  const debugCode = process.env.NODE_ENV === "production" ? undefined : code;
  return { ok: true, expiresAt: expiresAt.toISOString(), debugCode };
}

/**
 * Verifies and consumes the most recent unconsumed code. Throws on missing,
 * expired, or wrong codes and enforces an attempt budget.
 */
export async function verifyWalletOtp(userId: string, code: string): Promise<void> {
  const settings = await getCategorySettings("wallet");

  const otp = await prisma.walletOtp.findFirst({
    where: { userId, purpose: OTP_PURPOSE, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) {
    throw new AppError("OTP_REQUIRED", "Request a verification code first", 400);
  }
  if (otp.expiresAt < new Date()) {
    throw new AppError("OTP_EXPIRED", "Verification code has expired", 400);
  }
  if (otp.attempts >= settings.otpMaxAttempts) {
    throw new AppError(
      "OTP_TOO_MANY_ATTEMPTS",
      "Too many failed verification attempts, request a new code",
      429,
    );
  }

  const [salt, hash] = otp.codeHash.split(":");
  const candidate = Buffer.from(hashOtp(code.trim(), salt), "hex");
  const expected = Buffer.from(hash, "hex");

  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
    await prisma.walletOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError("OTP_INVALID", "Invalid verification code", 400);
  }

  await prisma.walletOtp.update({
    where: { id: otp.id },
    data: { attempts: { increment: 1 }, consumedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Request creation
// ---------------------------------------------------------------------------

function serializeRequest(r: {
  id: string;
  userId: string;
  kind: WalletRequestKind;
  amount: number;
  fee: number;
  status: WalletRequestStatus;
  method: string | null;
  note: string | null;
  adminId: string | null;
  adminNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): WalletRequest {
  return {
    id: r.id,
    userId: r.userId,
    kind: r.kind,
    amount: r.amount,
    fee: r.fee,
    status: r.status,
    method: r.method,
    note: r.note,
    adminId: r.adminId,
    adminNote: r.adminNote,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function createDepositRequest(
  userId: string,
  amount: number,
  method?: string,
): Promise<WalletRequest> {
  await assertWalletNotFrozen(userId);

  const settings = await getCategorySettings("wallet");
  if (amount < settings.minDeposit) {
    throw new AppError(
      "WALLET_LIMIT_EXCEEDED",
      `Minimum deposit is ${settings.minDeposit}`,
      400,
    );
  }
  if (settings.maxDeposit > 0 && amount > settings.maxDeposit) {
    throw new AppError(
      "WALLET_LIMIT_EXCEEDED",
      `Maximum deposit is ${settings.maxDeposit}`,
      400,
    );
  }

  const request = await prisma.walletRequest.create({
    data: { userId, kind: "DEPOSIT", amount, method: method?.trim() || null },
  });

  audit({
    actorType: "user",
    actorId: userId,
    action: "wallet.deposit.requested",
    category: "wallet",
    targetType: "walletRequest",
    targetId: request.id,
    meta: { amount, method: request.method },
  });

  return serializeRequest(request);
}

export async function createWithdrawalRequest(
  userId: string,
  amount: number,
  otpCode: string,
): Promise<WalletRequest> {
  await assertWalletNotFrozen(userId);

  const kycRequest = await prisma.kycRequest.findUnique({
    where: { userId },
    select: { status: true, level: true },
  });

  if (!kycRequest || kycRequest.status !== "APPROVED") {
    throw new AppError(
      "KYC_REQUIRED",
      "KYC verification is required for withdrawals. Please complete KYC verification first.",
      403,
    );
  }

  const withdrawalLimits = await prisma.kycWithdrawalLimit.findUnique({
    where: { level: kycRequest.level },
  });

  if (withdrawalLimits) {
    if (withdrawalLimits.singleWithdrawLimit === 0) {
      throw new AppError(
        "WITHDRAWAL_NOT_ALLOWED",
        "Withdrawals are not allowed for your current KYC level",
        403,
      );
    }

    if (amount > withdrawalLimits.singleWithdrawLimit) {
      throw new AppError(
        "WITHDRAWAL_LIMIT_EXCEEDED",
        `Withdrawal amount exceeds your limit of ${(withdrawalLimits.singleWithdrawLimit / 100).toFixed(2)}`,
        400,
      );
    }

    const todayStart = new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate(),
      ),
    );
    const { _sum } = await prisma.walletRequest.aggregate({
      where: {
        userId,
        kind: "WITHDRAWAL",
        status: { in: ["PENDING", "APPROVED"] },
        createdAt: { gte: todayStart },
      },
      _sum: { amount: true },
    });
    
    if ((_sum.amount ?? 0) + amount > withdrawalLimits.dailyLimit) {
      throw new AppError(
        "DAILY_WITHDRAWAL_LIMIT_EXCEEDED",
        `Daily withdrawal limit of ${(withdrawalLimits.dailyLimit / 100).toFixed(2)} reached`,
        400,
      );
    }
  }

  const settings = await getCategorySettings("wallet");
  if (amount < settings.minWithdrawal) {
    throw new AppError(
      "WALLET_LIMIT_EXCEEDED",
      `Minimum withdrawal is ${settings.minWithdrawal}`,
      400,
    );
  }
  if (settings.maxWithdrawal > 0 && amount > settings.maxWithdrawal) {
    throw new AppError(
      "WALLET_LIMIT_EXCEEDED",
      `Maximum withdrawal is ${settings.maxWithdrawal}`,
      400,
    );
  }

  const pending = await prisma.walletRequest.count({
    where: { userId, kind: "WITHDRAWAL", status: "PENDING" },
  });
  if (pending >= settings.maxPendingWithdrawalRequests) {
    throw new AppError(
      "WALLET_LIMIT_EXCEEDED",
      `Too many pending withdrawal requests (max ${settings.maxPendingWithdrawalRequests})`,
      400,
    );
  }

  if (settings.dailyWithdrawalLimit > 0) {
    const todayStart = new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate(),
      ),
    );
    const { _sum } = await prisma.walletRequest.aggregate({
      where: {
        userId,
        kind: "WITHDRAWAL",
        status: { in: ["PENDING", "APPROVED"] },
        createdAt: { gte: todayStart },
      },
      _sum: { amount: true },
    });
    if ((_sum.amount ?? 0) + amount > settings.dailyWithdrawalLimit) {
      throw new AppError(
        "DAILY_WITHDRAWAL_LIMIT_EXCEEDED",
        `Daily withdrawal limit of ${settings.dailyWithdrawalLimit} reached`,
        400,
      );
    }
  }

  await verifyWalletOtp(userId, otpCode);

  const wallet = await getWallet(userId);
  const fee =
    settings.withdrawalFeePercent > 0
      ? Math.round((amount * settings.withdrawalFeePercent) / 100)
      : 0;
  if (wallet.balance < amount + fee) {
    throw new AppError("INSUFFICIENT_BALANCE", "Insufficient balance", 400);
  }

  const request = await prisma.walletRequest.create({
    data: { userId, kind: "WITHDRAWAL", amount, fee },
  });

  audit({
    actorType: "user",
    actorId: userId,
    action: "wallet.withdrawal.requested",
    category: "wallet",
    targetType: "walletRequest",
    targetId: request.id,
    meta: { amount, fee, kycLevel: kycRequest.level },
  });

  return serializeRequest(request);
}

export async function cancelWalletRequest(
  userId: string,
  requestId: string,
): Promise<WalletRequest> {
  const updated = await prisma.$transaction(async (tx) => {
    await lockWalletRequestRow(tx, requestId);
    const request = await tx.walletRequest.findUnique({ where: { id: requestId } });
    if (!request || request.userId !== userId) {
      throw new AppError("WALLET_REQUEST_NOT_FOUND", "Request not found", 404);
    }
    if (request.status !== "PENDING") {
      throw new AppError(
        "WALLET_REQUEST_ALREADY_DECIDED",
        "This request has already been decided",
        409,
      );
    }
    return tx.walletRequest.update({
      where: { id: requestId },
      data: { status: "CANCELLED", decidedAt: new Date() },
    });
  });

  audit({
    actorType: "user",
    actorId: userId,
    action: "wallet.request.cancelled",
    category: "wallet",
    targetType: "walletRequest",
    targetId: requestId,
    meta: { kind: updated.kind },
  });

  return serializeRequest(updated);
}

// ---------------------------------------------------------------------------
// Admin decisions
// ---------------------------------------------------------------------------

async function assertPending(
  request: { id: string; status: WalletRequestStatus } | null,
): Promise<{ id: string; status: WalletRequestStatus }> {
  if (!request) {
    throw new AppError("WALLET_REQUEST_NOT_FOUND", "Request not found", 404);
  }
  if (request.status !== "PENDING") {
    throw new AppError(
      "WALLET_REQUEST_ALREADY_DECIDED",
      "This request has already been decided",
      409,
    );
  }
  return request;
}

/**
 * Approves a deposit or withdrawal. Runs in a read-committed transaction that
 * locks both the request row and the wallet row (`FOR UPDATE`), so two
 * concurrent approvals (or an approval racing a match settlement) cannot
 * double-credit or double-spend. Credits/debits go through `applyTransaction`,
 * which records a `Transaction` row with the post-change balance.
 */
export async function approveWalletRequest(
  adminId: string,
  requestId: string,
  adminNote?: string,
): Promise<WalletRequest> {
  const result = await prisma.$transaction(
    async (tx) => {
      await lockWalletRequestRow(tx, requestId);
      const request = await tx.walletRequest.findUnique({ where: { id: requestId } });
      await assertPending(request);

      await lockWalletRow(tx, request!.userId);

      if (request!.kind === "DEPOSIT") {
        await applyTransaction(
          tx,
          request!.userId,
          request!.amount,
          "DEPOSIT",
          request!.id,
          { method: request!.method, approvedBy: adminId },
          "MAIN",
        );
      } else {
        const wallet = await tx.wallet.findUniqueOrThrow({
          where: { userId: request!.userId },
        });
        const total = request!.amount + request!.fee;
        if (wallet.balance < total) {
          throw new AppError(
            "INSUFFICIENT_BALANCE",
            "Insufficient balance to approve this withdrawal",
            400,
          );
        }
        await applyTransaction(
          tx,
          request!.userId,
          -request!.amount,
          "WITHDRAWAL",
          request!.id,
          { approvedBy: adminId },
          "MAIN",
        );
        if (request!.fee > 0) {
          await applyTransaction(
            tx,
            request!.userId,
            -request!.fee,
            "WITHDRAWAL",
            request!.id,
            { approvedBy: adminId, fee: true },
            "MAIN",
          );
        }
      }

      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { userId: request!.userId },
      });

      const updated = await tx.walletRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          adminId,
          adminNote: adminNote?.trim() || null,
          decidedAt: new Date(),
        },
      });

      return { updated, wallet };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );

  const kindLabel = result.updated.kind === "DEPOSIT" ? "Deposit" : "Withdrawal";

  audit({
    actorType: "user",
    actorId: adminId,
    action: result.updated.kind === "DEPOSIT"
      ? "wallet.deposit.approved"
      : "wallet.withdrawal.approved",
    category: "wallet",
    targetType: "walletRequest",
    targetId: requestId,
    meta: {
      amount: result.updated.amount,
      fee: result.updated.fee,
      userId: result.updated.userId,
      balanceAfter: result.wallet.balance,
    },
  });

  await createNotification(
    result.updated.userId,
    "WALLET",
    `${kindLabel} approved`,
    `${kindLabel} of ${result.updated.amount} coins approved${
      result.updated.fee > 0 ? ` (fee ${result.updated.fee})` : ""
    }`,
    { requestId, kind: result.updated.kind, amount: result.updated.amount, status: "APPROVED" },
  );

  await notifyUserSocket(result.updated.userId, "wallet:updated", {
    event: result.updated.kind === "DEPOSIT" ? "deposit-approved" : "withdrawal-approved",
    requestId,
    kind: result.updated.kind,
    status: "APPROVED",
    balance: result.wallet.balance,
    message: `${kindLabel} approved`,
  });

  return serializeRequest(result.updated);
}

export async function rejectWalletRequest(
  adminId: string,
  requestId: string,
  reason: string,
): Promise<WalletRequest> {
  const updated = await prisma.$transaction(
    async (tx) => {
      await lockWalletRequestRow(tx, requestId);
      const request = await tx.walletRequest.findUnique({ where: { id: requestId } });
      await assertPending(request);
      return tx.walletRequest.update({
        where: { id: requestId },
        data: {
          status: "REJECTED",
          adminId,
          adminNote: reason.trim() || "Rejected",
          decidedAt: new Date(),
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );

  const kindLabel = updated.kind === "DEPOSIT" ? "Deposit" : "Withdrawal";

  audit({
    actorType: "user",
    actorId: adminId,
    action: updated.kind === "DEPOSIT"
      ? "wallet.deposit.rejected"
      : "wallet.withdrawal.rejected",
    category: "wallet",
    targetType: "walletRequest",
    targetId: requestId,
    meta: { amount: updated.amount, userId: updated.userId, reason },
  });

  await createNotification(
    updated.userId,
    "WALLET",
    `${kindLabel} rejected`,
    `${kindLabel} of ${updated.amount} coins was rejected`,
    { requestId, kind: updated.kind, amount: updated.amount, status: "REJECTED" },
  );

  await notifyUserSocket(updated.userId, "wallet:updated", {
    event: updated.kind === "DEPOSIT" ? "deposit-rejected" : "withdrawal-rejected",
    requestId,
    kind: updated.kind,
    status: "REJECTED",
    message: `${kindLabel} rejected`,
  });

  return serializeRequest(updated);
}

// ---------------------------------------------------------------------------
// Freeze / unfreeze
// ---------------------------------------------------------------------------

export async function setWalletFrozen(
  adminId: string,
  userId: string,
  frozen: boolean,
  reason?: string,
) {
  const wallet = await getWallet(userId);
  const updated = await prisma.wallet.update({
    where: { userId },
    data: frozen
      ? { isFrozen: true, frozenAt: new Date(), frozenReason: reason?.trim() || null }
      : { isFrozen: false, frozenAt: null, frozenReason: null },
  });

  audit({
    actorType: "user",
    actorId: adminId,
    action: frozen ? "wallet.frozen" : "wallet.unfrozen",
    category: "wallet",
    targetType: "user",
    targetId: userId,
    meta: { reason: reason ?? null, wasFrozen: wallet.isFrozen },
  });

  if (frozen !== wallet.isFrozen) {
    await notifyUserSocket(userId, "wallet:updated", {
      event: frozen ? "wallet-frozen" : "wallet-unfrozen",
      message: frozen
        ? (reason?.trim() ?? "Your wallet has been frozen")
        : "Your wallet has been unfrozen",
    });
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export interface WalletRequestFilter {
  userId?: string;
  kind?: WalletRequestKind;
  status?: WalletRequestStatus;
}

export async function listWalletRequests(
  filter: WalletRequestFilter,
  page: number,
  pageSize: number,
) {
  const where = {
    ...(filter.userId ? { userId: filter.userId } : {}),
    ...(filter.kind ? { kind: filter.kind } : {}),
    ...(filter.status ? { status: filter.status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.walletRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.walletRequest.count({ where }),
  ]);

  return {
    items: items.map(serializeRequest),
    total,
    page,
    pageSize,
  };
}

export async function getWalletRequest(requestId: string): Promise<WalletRequest> {
  const request = await prisma.walletRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    throw new AppError("WALLET_REQUEST_NOT_FOUND", "Request not found", 404);
  }
  return serializeRequest(request);
}
