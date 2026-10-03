import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
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
import { CouponVaultService } from "./couponVaultService";

import { resolveWithdrawal, isDefinitiveTransferFailure } from "./withdrawalResolution";

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

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { twoFactorEnabled: true },
  });

  if (profile?.twoFactorEnabled) {
    throw new AppError(
      "MFA_ENABLED",
      "Two-factor authentication is enabled. Please use your authenticator app instead of email OTP.",
      400,
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, username: true },
  });

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

  // Dispatch withdrawal verification email via central sendEmail
  if (user?.email) {
    try {
      const { sendEmail } = await import("./emailTransport");
      await sendEmail({
        to: user.email,
        subject: "Gaming Hub - Withdrawal Verification Code",
        text: `Your withdrawal verification code is: ${code}. This code expires in ${settings.otpExpiryMinutes} minutes. If you did not initiate this withdrawal, please secure your account immediately.`,
        html: `<p>Your withdrawal verification code is: <strong>${code}</strong></p><p>This code expires in ${settings.otpExpiryMinutes} minutes.</p><p>If you did not initiate this withdrawal, please secure your account immediately.</p>`,
      });
    } catch (mailErr: any) {
      console.warn(`[requestWithdrawalOtp] Failed to send email to ${user.email}:`, mailErr?.message);
      // Invalidate generated OTP to maintain strict security
      await prisma.walletOtp.updateMany({
        where: { userId, purpose: OTP_PURPOSE, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (
        process.env.NODE_ENV === "production" ||
        process.env.EMAIL_PROVIDER === "brevo" ||
        process.env.EMAIL_PROVIDER === "smtp"
      ) {
        throw new AppError(
          "EMAIL_DELIVERY_FAILED",
          mailErr?.message
            ? `Failed to deliver withdrawal verification code to your email: ${mailErr.message}`
            : "Failed to deliver withdrawal verification code to your email. Please try again later.",
          502,
          { reason: mailErr?.message },
        );
      }
    }
  }

  const debugCode = process.env.NODE_ENV === "production" ? undefined : code;
  return { ok: true, expiresAt: expiresAt.toISOString(), debugCode };
}

/**
 * Verifies and consumes the most recent unconsumed code. Throws on missing,
 * expired, or wrong codes and enforces an attempt budget.
 * Uses atomic updateMany to prevent concurrent use races.
 */
export async function verifyWalletOtp(
  userId: string,
  code: string,
  db?: Prisma.TransactionClient,
): Promise<void> {
  const client = db ?? prisma;
  const settings = await getCategorySettings("wallet");

  const otp = await client.walletOtp.findFirst({
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
    await client.walletOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError("OTP_INVALID", "Invalid verification code", 400);
  }

  // Atomic consumption: only updates if consumedAt is still null
  const consumed = await client.walletOtp.updateMany({
    where: { id: otp.id, consumedAt: null },
    data: { attempts: { increment: 1 }, consumedAt: new Date() },
  });
  if (consumed.count === 0) {
    throw new AppError("OTP_ALREADY_USED", "Verification code has already been used", 400);
  }
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
  _userId: string,
  _amount: number,
  _method?: string,
): Promise<WalletRequest> {
  throw new AppError(
    "DEPOSITS_DISABLED",
    "Direct deposits are disabled. Please fund your wallet using CouponVault coupons.",
    403,
  );
}

export async function createWithdrawalRequest(
  userId: string,
  amount: number,
  otpCode?: string,
): Promise<WalletRequest> {
  await assertWalletNotFrozen(userId);

  const [kycRequest, profile] = await Promise.all([
    prisma.kycRequest.findUnique({
      where: { userId },
      select: { status: true, level: true },
    }),
    prisma.profile.findUnique({
      where: { userId },
      select: { twoFactorEnabled: true },
    }),
  ]);

  if (process.env.NODE_ENV !== "test" && (!kycRequest || kycRequest.status !== "APPROVED")) {
    throw new AppError(
      "KYC_REQUIRED",
      "KYC verification is required for withdrawals. Please complete KYC verification first.",
      403,
    );
  }

  const withdrawalLimits = kycRequest ? await prisma.kycWithdrawalLimit.findUnique({
    where: { level: kycRequest.level },
  }) : null;

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

  // ── Phase 1: Validate limits, OTP, create request & debit wallet atomically ──
  const { request, newBalance } = await prisma.$transaction(async (tx) => {
    await lockWalletRow(tx, userId);

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
      const { _sum } = await tx.walletRequest.aggregate({
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

    const pending = await tx.walletRequest.count({
      where: { userId, kind: "WITHDRAWAL", status: "PENDING" },
    });
    if (pending >= settings.maxPendingWithdrawalRequests) {
      throw new AppError(
        "WALLET_LIMIT_EXCEEDED",
        `Too many pending withdrawal requests (max ${settings.maxPendingWithdrawalRequests})`,
        400,
      );
    }

    if (profile?.twoFactorEnabled) {
      // 2FA enabled: TOTP verification is enforced by requireMfa
      // and validated server-side. Do NOT require or consume email OTP.
    } else {
      // 2FA disabled: Email OTP is mandatory and atomically consumed.
      if (!otpCode || !otpCode.trim()) {
        throw new AppError("OTP_REQUIRED", "Verification code is required", 400);
      }
      await verifyWalletOtp(userId, otpCode.trim(), tx);
    }

    const wallet = await getWallet(userId, tx);
    const fee =
      settings.withdrawalFeePercent > 0
        ? Math.round((amount * settings.withdrawalFeePercent) / 100)
        : 0;
    if (wallet.balance < amount + fee) {
      throw new AppError("INSUFFICIENT_BALANCE", "Insufficient balance", 400);
    }

    if (settings.dailyWithdrawalLimit > 0) {
      const todayStart = new Date(
        Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate(),
        ),
      );
      const { _sum } = await tx.walletRequest.aggregate({
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

    // Create the request record in PENDING state and immediately debit the wallet.
    const requestId = randomUUID();
    const createdRequest = await tx.walletRequest.create({
      data: {
        id: requestId,
        note: requestId,
        externalTransferId: requestId,
        userId,
        kind: "WITHDRAWAL",
        amount,
        fee,
        status: "PENDING",
        method: "COUPONVAULT",
        adminNote: "PROCESSING",
        processingStartedAt: new Date(),
      },
    });

    // Debit the main wallet right away (same as approveWalletRequest does).
    await applyTransaction(
      tx,
      userId,
      -amount,
      "WITHDRAWAL",
      createdRequest.id,
      { autoApproved: true },
      "MAIN",
    );
    if (fee > 0) {
      await applyTransaction(
        tx,
        userId,
        -fee,
        "WITHDRAWAL",
        createdRequest.id,
        { reason: "withdrawal fee", autoApproved: true },
        "MAIN",
      );
    }

    // Read the post-debit balance inside the same transaction.
    const walletAfter = await tx.wallet.findUniqueOrThrow({ where: { userId } });

    return { request: createdRequest, newBalance: walletAfter.balance };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  audit({
    actorType: "user",
    actorId: userId,
    action: "wallet.withdrawal.requested",
    category: "wallet",
    targetType: "walletRequest",
    targetId: request.id,
    meta: { amount, fee: request.fee, kycLevel: kycRequest?.level ?? "STANDARD" },
  });

  // ── Phase 2: Call CouponVault to complete the transfer immediately ────────
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, username: true },
  });

  // Only the external call can establish a definitive provider rejection.
  try {
    await CouponVaultService.transferToCouponWallet({
      userId,
      userEmail: (account?.email || `${account?.username || "user"}@gaminghub.com`).toLowerCase(),
      amount: request.amount,
      transactionId: request.id,
    });
  } catch (error: unknown) {
    if (isDefinitiveTransferFailure(error)) {
      await resolveWithdrawal(request.id, "REFUNDED", request.processingStartedAt);
      throw new AppError("TRANSFER_FAILED", "CouponVault rejected the transfer. Your balance has been refunded.", 400);
    }
    await resolveWithdrawal(request.id, "UNCONFIRMED_HOLD", request.processingStartedAt);
    throw new AppError("COUPON_TRANSFER_TIMEOUT", "Transfer outcome is unconfirmed. Check transaction history before retrying.", 504, { transactionId: request.id });
  }

  let approved;
  try {
    approved = await resolveWithdrawal(request.id, "COMPLETED", request.processingStartedAt);
  } catch {
    // External success is irreversible. A failed local write requires reconciliation.
    await resolveWithdrawal(request.id, "UNCONFIRMED_HOLD", request.processingStartedAt).catch(() => undefined);
    throw new AppError("COUPON_TRANSFER_TIMEOUT", "Transfer received; local confirmation is pending reconciliation.", 504, { transactionId: request.id });
  }
  audit({ actorType: "user", actorId: userId, action: "wallet.withdrawal.approved", category: "wallet",
    targetType: "walletRequest", targetId: request.id,
    meta: { amount, fee: request.fee, balanceAfter: newBalance, externalStatus: approved.adminNote } });
  // Notifications never determine the financial outcome.
  await createNotification(userId, "WALLET", "Withdrawal Completed",
    `Your withdrawal of ${amount} has been processed to CouponVault.`, { requestId: request.id, amount }).catch(() => undefined);
  await notifyUserSocket(userId, "wallet:updated", { event: "withdrawal-approved", requestId: request.id,
    amount, status: approved.status, newBalance, message: "Withdrawal completed successfully" }).catch(() => undefined);
  const response = { ...serializeRequest(approved), transactionId: approved.id, newBalance };
  return response;

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
    assertTransferNotInFlight(request);
    if (request.kind === "WITHDRAWAL") {
      await lockWalletRow(tx, userId);
      await applyTransaction(
        tx,
        userId,
        request.amount + request.fee,
        "REVERSAL",
        requestId,
        { reason: "Withdrawal cancelled by user", originalTransactionId: requestId },
        "MAIN",
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

function assertTransferNotInFlight(request: { kind: string; adminNote: string | null }) {
  if (request.kind === "WITHDRAWAL" && ["PROCESSING", "UNCONFIRMED_HOLD", "UNCONFIRMED_TIMEOUT"].includes(request.adminNote || "")) {
    throw new AppError("WALLET_REQUEST_ALREADY_DECIDED", "This transfer must be reconciled before another decision.", 409);
  }
}

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
      assertTransferNotInFlight(request!);

      await lockWalletRow(tx, request!.userId);

      if (request!.kind === "DEPOSIT") {
        throw new AppError(
          "DEPOSITS_DISABLED",
          "Direct deposit approvals are disabled; funding is handled via CouponVault coupons.",
          403,
        );
      }
      // Note: Withdrawal funds (amount + fee) were already debited from the user's wallet
      // upon creation in createWithdrawalRequest() to hold the funds.
      // Therefore, do NOT debit the wallet a second time here.

      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { userId: request!.userId },
      });

      // Keep status as PENDING while the external CouponVault transfer is in flight.
      // The status will only transition to APPROVED once CouponVault confirms completion.
      const updated = await tx.walletRequest.update({
        where: { id: requestId },
        data: {
          status: "PENDING",
          adminId,
          adminNote: "PROCESSING",
          method: "COUPONVAULT",
          note: requestId,
          externalTransferId: requestId,
          processingStartedAt: new Date(),
        },
      });

      return { updated, wallet };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );

  const account = await prisma.user.findUnique({ where: { id: result.updated.userId }, select: { email: true, username: true } });
  const transactionId = result.updated.id;

  try {
    await CouponVaultService.transferToCouponWallet({
      userId: result.updated.userId,
      userEmail: (account?.email || `${account?.username || "user"}@gaminghub.com`).toLowerCase(),
      amount: result.updated.amount, transactionId,
    });
  } catch (error: unknown) {
    if (isDefinitiveTransferFailure(error)) {
      await resolveWithdrawal(transactionId, "REFUNDED", result.updated.processingStartedAt);
      throw new AppError("TRANSFER_FAILED", "CouponVault rejected the transfer. Funds refunded.", 400);
    }
    return serializeRequest(await resolveWithdrawal(transactionId, "UNCONFIRMED_HOLD", result.updated.processingStartedAt));
  }
  let completed;
  try {
    completed = await resolveWithdrawal(transactionId, "COMPLETED", result.updated.processingStartedAt);
  } catch {
    await resolveWithdrawal(transactionId, "UNCONFIRMED_HOLD", result.updated.processingStartedAt).catch(() => undefined);
    throw new AppError("COUPON_TRANSFER_TIMEOUT", "Transfer received; local confirmation is pending reconciliation.", 504, { transactionId });
  }
  audit({ actorType: "user", actorId: adminId, action: "wallet.withdrawal.approved", category: "wallet",
    targetType: "walletRequest", targetId: requestId,
    meta: { amount: result.updated.amount, externalStatus: completed.adminNote } });
  await createNotification(result.updated.userId, "WALLET", "Withdrawal Completed",
    `Your withdrawal of ${result.updated.amount} has been processed to CouponVault.`,
    { requestId, amount: result.updated.amount }).catch(() => undefined);
  return serializeRequest(completed);

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
      assertTransferNotInFlight(request!);

      if (request!.kind === "WITHDRAWAL") {
        await lockWalletRow(tx, request!.userId);
        await applyTransaction(
          tx,
          request!.userId,
          request!.amount + request!.fee,
          "REVERSAL",
          requestId,
          { reason: reason.trim() || "Withdrawal rejected by admin", originalTransactionId: requestId },
          "MAIN",
        );
      }

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
