import { prisma } from "@gaming-hub/db";
import type { Prisma, Wallet } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type {
  TransactionReferenceType,
  TransactionType,
  WalletBalanceType,
} from "@gaming-hub/shared";
import { audit } from "./audit";
import { createNotification } from "./notifications";
import { getCategorySettings } from "./settings";
import { getFeatureFlags } from "./featureFlags";
import { CouponVaultService } from "./couponVaultService";

const BALANCE_FIELD: Record<WalletBalanceType, keyof Pick<Wallet, "balance" | "bonusBalance" | "lockedBalance" | "rewardBalance" | "cashbackBalance">> = {
  MAIN: "balance",
  BONUS: "bonusBalance",
  LOCKED: "lockedBalance",
  REWARD: "rewardBalance",
  CASHBACK: "cashbackBalance",
};

/**
 * Zeroes out balance types whose feature flag is disabled so users cannot see
 * bonus/locked/cashback balances once an admin turns those features off.
 */
async function maskWalletBalances(wallet: Wallet): Promise<Wallet> {
  const flags = await getFeatureFlags();
  return {
    ...wallet,
    bonusBalance: flags["payments.bonusWallet"] === false ? 0 : wallet.bonusBalance,
    lockedBalance: flags["payments.lockedWallet"] === false ? 0 : wallet.lockedBalance,
    cashbackBalance: flags["payments.cashback"] === false ? 0 : wallet.cashbackBalance,
  };
}

export async function getWallet(userId: string): Promise<Wallet> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    throw new AppError("NOT_FOUND", "Wallet not found", 404);
  }
  return maskWalletBalances(wallet);
}

export async function listTransactions(
  userId: string,
  page: number,
  pageSize: number,
  walletType?: WalletBalanceType,
  referenceType?: TransactionReferenceType,
) {
  const where = {
    userId,
    ...(walletType ? { walletType } : {}),
    ...(referenceType ? { referenceType } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    items: items.map((t) => {
      const metaObj = (t.meta && typeof t.meta === "object" ? t.meta : {}) as Record<string, unknown>;
      const isDebit = t.type === "DEBIT";
      const balanceBefore = typeof metaObj.balanceBefore === "number"
        ? metaObj.balanceBefore
        : isDebit
          ? t.balanceAfter + t.amount
          : t.balanceAfter - t.amount;

      return {
        id: t.id,
        userId: t.userId,
        type: t.type,
        direction: (isDebit ? "DEBIT" : "CREDIT") as "CREDIT" | "DEBIT",
        amount: t.amount,
        balanceBefore,
        balanceAfter: t.balanceAfter,
        walletType: t.walletType,
        referenceType: t.referenceType,
        referenceId: t.referenceId,
        meta: t.meta,
        createdAt: t.createdAt.toISOString(),
      };
    }),
    total,
    page,
    pageSize,
  };
}

/**
 * Atomic balance mutation on a specific wallet balance. Returns the updated
 * wallet. `amount` is positive for credits and negative for debits.
 *
 * Uses a guarded `updateMany` so concurrent debits cannot double-spend: only
 * one in-flight transaction can satisfy the balance guard, the rest fail with
 * INSUFFICIENT_BALANCE.
 */
export async function applyTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  referenceType: TransactionReferenceType,
  referenceId: string | null,
  meta: Record<string, unknown> = {},
  walletType: WalletBalanceType = "MAIN",
): Promise<Wallet> {
  const isDebit = amount < 0;
  const field = BALANCE_FIELD[walletType];

  if (referenceType === "ADMIN" && !isDebit && walletType === "MAIN") {
    const walletLimits = await getCategorySettings("wallet");
    const absAmount = Math.abs(amount);
    if (absAmount < walletLimits.minDeposit) {
      throw new AppError(
        "WALLET_LIMIT_EXCEEDED",
        `Minimum deposit is ${walletLimits.minDeposit}`,
        400,
      );
    }
    if (walletLimits.maxDeposit > 0 && absAmount > walletLimits.maxDeposit) {
      throw new AppError(
        "WALLET_LIMIT_EXCEEDED",
        `Maximum deposit is ${walletLimits.maxDeposit}`,
        400,
      );
    }
  }

  if (referenceType === "ADMIN" && isDebit && walletType === "MAIN") {
    const walletLimits = await getCategorySettings("wallet");
    const absAmount = Math.abs(amount);
    if (absAmount < walletLimits.minWithdrawal) {
      throw new AppError(
        "WALLET_LIMIT_EXCEEDED",
        `Minimum withdrawal is ${walletLimits.minWithdrawal}`,
        400,
      );
    }
    if (walletLimits.maxWithdrawal > 0 && absAmount > walletLimits.maxWithdrawal) {
      throw new AppError(
        "WALLET_LIMIT_EXCEEDED",
        `Maximum withdrawal is ${walletLimits.maxWithdrawal}`,
        400,
      );
    }
  }

  const result = await tx.wallet.updateMany({
    where: { userId, ...(isDebit ? { [field]: { gte: -amount } } : {}) },
    data: { [field]: { increment: amount } },
  });

  if (result.count === 0) {
    const exists = await tx.wallet.findUnique({ where: { userId }, select: { userId: true } });
    if (!exists) {
      throw new AppError("NOT_FOUND", "Wallet not found", 404);
    }
    audit({
      actorType: "user",
      actorId: userId,
      action: "wallet.transaction.rejected",
      category: "wallet",
      targetType: "user",
      targetId: userId,
      meta: {
        amount,
        walletType,
        referenceType,
        referenceId,
        reason: "insufficient_balance",
      },
    });
    throw new AppError("INSUFFICIENT_BALANCE", "Insufficient balance");
  }

  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
  const balanceAfter = wallet[field];
  const balanceBefore = balanceAfter - amount;

  if (walletType === "MAIN") {
    await tx.profile.updateMany({
      where: { userId },
      data: { coins: balanceAfter },
    });
  }

  const transactionMeta = {
    balanceBefore,
    balanceAfter,
    direction: isDebit ? "DEBIT" : "CREDIT",
    ...meta,
  };

  await tx.transaction.create({
    data: {
      userId,
      type: (isDebit ? "DEBIT" : "CREDIT") as TransactionType,
      amount: Math.abs(amount),
      balanceBefore,
      balanceAfter,
      walletType,
      referenceType,
      referenceId,
      meta: transactionMeta as Prisma.InputJsonValue,
    },
  });

  audit({
    actorType: "user",
    actorId: userId,
    action: "wallet.transaction.created",
    category: "wallet",
    targetType: "user",
    targetId: userId,
    meta: {
      type: isDebit ? "DEBIT" : "CREDIT",
      amount: Math.abs(amount),
      walletType,
      balanceBefore,
      balanceAfter,
      referenceType,
      referenceId,
      ...meta,
    },
  });

  return wallet;
}

export async function assertSufficientBalance(userId: string, stake: number): Promise<void> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || wallet.balance < stake) {
    throw new AppError("INSUFFICIENT_BALANCE", "Insufficient balance to join this match");
  }
}

export interface PracticeRewardResult {
  claimed: boolean;
  amount: number;
  balance: number;
  remainingToday: number;
}

export async function claimPracticeReward(
  userId: string,
  _gameId: string,
): Promise<PracticeRewardResult> {
  const wallet = await getWallet(userId);
  return {
    claimed: false,
    amount: 0,
    balance: wallet.balance,
    remainingToday: 0,
  };
}

export async function getWalletSummary(userId: string) {
  const [wallet, deposited, withdrawn, spent, won] = await Promise.all([
    getWallet(userId),
    prisma.transaction.aggregate({
      where: { userId, referenceType: { in: ["DEPOSIT", "COUPON", "BONUS"] }, type: "CREDIT" },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, referenceType: "WITHDRAWAL" },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, referenceType: "MATCH_WAGER" },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, referenceType: "MATCH_PAYOUT" },
      _sum: { amount: true },
    }),
  ]);

  return {
    balance: wallet.balance,
    bonusBalance: wallet.bonusBalance,
    lockedBalance: wallet.lockedBalance,
    rewardBalance: wallet.rewardBalance,
    cashbackBalance: wallet.cashbackBalance,
    totalDeposited: deposited._sum.amount ?? 0,
    totalWithdrawn: withdrawn._sum.amount ?? 0,
    totalSpent: spent._sum.amount ?? 0,
    totalWon: won._sum.amount ?? 0,
  };
}

export async function transferToCouponWallet(
  userId: string,
  amount: number,
  otp?: string,
) {
  if (amount < 50) {
    throw new AppError("VALIDATION_ERROR", "Minimum transfer amount is 50 coins", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true },
  });
  if (!user) {
    throw new AppError("NOT_FOUND", "User not found", 404);
  }

  // If OTP is provided, verify it
  if (otp && otp.trim()) {
    const { verifyWalletOtp } = await import("./walletRequests");
    await verifyWalletOtp(userId, otp.trim());
  }

  const currentWallet = await getWallet(userId);
  if (currentWallet.isFrozen) {
    throw new AppError("WALLET_FROZEN", "Wallet is frozen", 403);
  }
  if (currentWallet.balance < amount) {
    throw new AppError("INSUFFICIENT_BALANCE", "Insufficient balance for transfer", 400);
  }

  const transactionId = `TRF-${userId.substring(0, 8)}-${Date.now()}`;
  const userEmail = (user.email || `${user.username.toLowerCase()}@gaminghub.com`).toLowerCase().trim();

  // 1. Atomically deduct balance and create PENDING records inside a transaction
  let updatedWallet: Wallet;
  try {
    updatedWallet = await prisma.$transaction(async (tx) => {
      const w = await applyTransaction(
        tx,
        userId,
        -amount,
        "WITHDRAWAL",
        transactionId,
        {
          destination: "COUPONVAULT",
          status: "PENDING",
          transactionId,
        },
        "MAIN",
      );

      await tx.walletRequest.create({
        data: {
          userId,
          kind: "WITHDRAWAL",
          amount,
          fee: 0,
          status: "PENDING",
          method: "COUPONVAULT",
          note: transactionId,
        },
      });

      return w;
    });
  } catch (err: any) {
    console.error("Wallet deduction failed for transfer:", err);
    throw new AppError("INSUFFICIENT_BALANCE", "Insufficient balance or wallet error.", 400);
  }

  // Helper to safely refund in case of confirmed failure
  const refundWallet = async (reason: string) => {
    try {
      await prisma.$transaction(async (tx) => {
        await applyTransaction(
          tx,
          userId,
          amount,
          "REVERSAL",
          transactionId,
          {
            reason,
            originalTransactionId: transactionId,
          },
          "MAIN",
        );
        await tx.walletRequest.updateMany({
          where: { note: transactionId },
          data: { status: "REJECTED", adminNote: reason },
        });
        await tx.transaction.updateMany({
          where: { referenceId: transactionId },
          data: {
            meta: {
              destination: "COUPONVAULT",
              status: "FAILED",
              transactionId,
              refundReason: reason,
            },
          },
        });
      });

      // Emit wallet update after refund
      const { WalletSyncService } = await import("./walletSyncService");
      const postRefundWallet = await getWallet(userId);
      WalletSyncService.emitWalletUpdate({
        userId,
        balance: postRefundWallet.balance,
        bonusBalance: postRefundWallet.bonusBalance,
        lockedBalance: postRefundWallet.lockedBalance,
        rewardBalance: postRefundWallet.rewardBalance,
        cashbackBalance: postRefundWallet.cashbackBalance,
        type: "CREDIT",
        amount,
      });
    } catch (refundErr) {
      console.error("CRITICAL: Failed to refund wallet after CouponVault API failure", {
        userId,
        transactionId,
        refundErr,
      });
    }
  };

  // 2. Call CouponVault transfer endpoint
  let transferResult;
  try {
    transferResult = await CouponVaultService.transferToCouponWallet({
      userId,
      userEmail,
      amount,
      transactionId,
    });
  } catch (err: any) {
    // Check if error is uncertain / timeout
    if (err?.isTimeout || err?.isUncertain || err?.statusCode === 504) {
      console.error("CRITICAL: External transfer timeout or unconfirmed state", {
        userId,
        transactionId,
        err,
      });
      await prisma.$transaction(async (tx) => {
        await tx.walletRequest.updateMany({
          where: { note: transactionId },
          data: { adminNote: "UNCONFIRMED_HOLD" },
        });
        await tx.transaction.updateMany({
          where: { referenceId: transactionId },
          data: {
            meta: {
              destination: "COUPONVAULT",
              status: "UNCONFIRMED_HOLD",
              transactionId,
            },
          },
        });
      });
      throw new AppError(
        "COUPON_TRANSFER_TIMEOUT",
        "Transfer request is processing. Please check your transaction history before retrying.",
        504,
      );
    }

    // Confirmed failure: refund wallet and report error
    console.error("Transfer to CouponVault failed with confirmed failure:", err);
    await refundWallet(err.message || "transfer_failed");
    throw new AppError(err.code || "TRANSFER_FAILED", err.message || "Failed to transfer to Coupon Wallet", 400);
  }

  // 3. Mark transaction as COMPLETED
  try {
    await prisma.$transaction(async (tx) => {
      await tx.walletRequest.updateMany({
        where: { note: transactionId },
        data: { status: "APPROVED", decidedAt: new Date() },
      });
      await tx.transaction.updateMany({
        where: { referenceId: transactionId },
        data: {
          meta: {
            destination: "COUPONVAULT",
            status: "COMPLETED",
            transactionId,
            isDuplicate: transferResult.isDuplicate ?? false,
          },
        },
      });
    });
  } catch (dbErr) {
    console.error("Error updating transaction status to COMPLETED:", dbErr);
  }

  // Emit real-time wallet synchronization event
  try {
    const { WalletSyncService } = await import("./walletSyncService");
    WalletSyncService.emitWalletUpdate({
      userId,
      balance: updatedWallet.balance,
      bonusBalance: updatedWallet.bonusBalance,
      lockedBalance: updatedWallet.lockedBalance,
      rewardBalance: updatedWallet.rewardBalance,
      cashbackBalance: updatedWallet.cashbackBalance,
      type: "DEBIT",
      amount,
    });
  } catch (syncErr) {
    console.warn("Wallet sync event emission failed:", syncErr);
  }

  audit({
    actorType: "user",
    actorId: userId,
    action: "wallet.transfer.completed",
    category: "wallet",
    targetType: "walletRequest",
    targetId: transactionId,
    meta: { amount, transactionId, destination: "COUPONVAULT" },
  });

  await createNotification(
    userId,
    "WALLET",
    "Transfer Successful",
    `🪙 ${amount.toLocaleString()} Coins have been transferred to your Coupon Wallet.`,
    { transactionId, amount },
  );

  return {
    ok: true,
    success: true,
    transactionId,
    transferredAmount: amount,
    newBalance: updatedWallet.balance,
  };
}

export const withdrawToCouponWallet = transferToCouponWallet;

/**
 * Reconciliation mechanism for unknown / unconfirmed external transfers.
 *
 * State flow:
 * PENDING
 *    ↓
 * UNCONFIRMED_HOLD
 *    ↓
 * reconciliation
 *    ├── CouponVault confirms success → COMPLETED
 *    └── CouponVault confirms not processed → REFUND
 *
 * CRITICAL: Never resolve an unknown transaction by blindly refunding!
 * If CouponVault cannot be reached, the transaction MUST remain in UNCONFIRMED_HOLD.
 */
export async function reconcileUnconfirmedTransfer(transactionId: string): Promise<{
  transactionId: string;
  reconciled: boolean;
  resolution: "COMPLETED" | "REFUNDED" | "HELD";
  message: string;
}> {
  const walletRequest = await prisma.walletRequest.findFirst({
    where: { note: transactionId, kind: "WITHDRAWAL", method: "COUPONVAULT" },
  });

  if (!walletRequest) {
    throw new AppError("NOT_FOUND", `No wallet request found for transactionId: ${transactionId}`, 404);
  }

  if (walletRequest.status === "APPROVED") {
    return {
      transactionId,
      reconciled: true,
      resolution: "COMPLETED",
      message: "Transaction already confirmed and completed.",
    };
  }

  if (walletRequest.status === "REJECTED") {
    return {
      transactionId,
      reconciled: true,
      resolution: "REFUNDED",
      message: "Transaction already resolved and refunded.",
    };
  }

  const userId = walletRequest.userId;
  const amount = Number(walletRequest.amount);

  // Query CouponVault for authoritative external transfer status
  let checkResult;
  try {
    checkResult = await CouponVaultService.checkTransferStatus(transactionId);
  } catch (err: any) {
    console.warn(
      `[Reconciliation] CouponVault unreachable for transaction ${transactionId}, maintaining UNCONFIRMED_HOLD:`,
      err.message,
    );
    return {
      transactionId,
      reconciled: false,
      resolution: "HELD",
      message: `CouponVault service unavailable (${err.message}). Kept in UNCONFIRMED_HOLD.`,
    };
  }

  if (checkResult.processed) {
    // 1. CouponVault confirms success → Mark COMPLETED
    await prisma.$transaction(async (tx) => {
      await tx.walletRequest.updateMany({
        where: { note: transactionId },
        data: { status: "APPROVED", adminNote: "RECONCILED_SUCCESS", decidedAt: new Date() },
      });
      await tx.transaction.updateMany({
        where: { referenceId: transactionId },
        data: {
          meta: {
            destination: "COUPONVAULT",
            status: "COMPLETED",
            transactionId,
            reconciledAt: new Date().toISOString(),
          },
        },
      });
    });

    return {
      transactionId,
      reconciled: true,
      resolution: "COMPLETED",
      message: "CouponVault confirmed transfer was received and processed. Marked COMPLETED.",
    };
  } else {
    // 2. CouponVault confirms NOT processed → Atomically REFUND balance
    await prisma.$transaction(async (tx) => {
      await applyTransaction(
        tx,
        userId,
        amount,
        "REVERSAL",
        transactionId,
        {
          reason: "RECONCILED_UNPROCESSED_REFUND",
          originalTransactionId: transactionId,
        },
        "MAIN",
      );
      await tx.walletRequest.updateMany({
        where: { note: transactionId },
        data: { status: "REJECTED", adminNote: "RECONCILED_UNPROCESSED_REFUND", decidedAt: new Date() },
      });
      await tx.transaction.updateMany({
        where: { referenceId: transactionId },
        data: {
          meta: {
            destination: "COUPONVAULT",
            status: "REFUNDED",
            transactionId,
            reconciledAt: new Date().toISOString(),
          },
        },
      });
    });

    // Notify user socket
    try {
      const { WalletSyncService } = await import("./walletSyncService");
      const postRefundWallet = await getWallet(userId);
      WalletSyncService.emitWalletUpdate({
        userId,
        balance: postRefundWallet.balance,
        bonusBalance: postRefundWallet.bonusBalance,
        lockedBalance: postRefundWallet.lockedBalance,
        rewardBalance: postRefundWallet.rewardBalance,
        cashbackBalance: postRefundWallet.cashbackBalance,
        type: "CREDIT",
        amount,
      });
    } catch (e) {
      console.warn("[Reconciliation] Failed to emit socket update:", e);
    }

    return {
      transactionId,
      reconciled: true,
      resolution: "REFUNDED",
      message: "CouponVault confirmed transfer was NOT processed. Balance safely refunded to Gaming Hub wallet.",
    };
  }
}

/**
 * Batch-reconcile all transactions in UNCONFIRMED_HOLD.
 */
export async function reconcileAllUnconfirmedTransfers(): Promise<{
  totalChecked: number;
  completed: number;
  refunded: number;
  stillHeld: number;
}> {
  const heldRequests = await prisma.walletRequest.findMany({
    where: {
      kind: "WITHDRAWAL",
      method: "COUPONVAULT",
      status: "PENDING",
      adminNote: { in: ["UNCONFIRMED_HOLD", "UNCONFIRMED_TIMEOUT"] },
    },
    take: 50,
  });

  let completed = 0;
  let refunded = 0;
  let stillHeld = 0;

  for (const req of heldRequests) {
    if (!req.note) continue;
    try {
      const res = await reconcileUnconfirmedTransfer(req.note);
      if (res.resolution === "COMPLETED") completed++;
      else if (res.resolution === "REFUNDED") refunded++;
      else stillHeld++;
    } catch (err) {
      console.error(`Error reconciling transaction ${req.note}:`, err);
      stillHeld++;
    }
  }

  return {
    totalChecked: heldRequests.length,
    completed,
    refunded,
    stillHeld,
  };
}


