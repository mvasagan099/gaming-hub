import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { notifyUserSocket } from "./socketBridge";

export interface WalletSyncPayload {
  userId: string;
  balance: number;
  bonusBalance: number;
  lockedBalance: number;
  rewardBalance: number;
  cashbackBalance: number;
  transactionId?: string;
  type?: string;
  amount?: number;
  updatedAt: string;
}

export type WalletSyncListener = (payload: WalletSyncPayload) => void;

export class WalletSyncService {
  private static readonly listeners = new Set<WalletSyncListener>();

  /**
   * Register listener for server/socket balance sync events.
   */
  static registerSyncListener(listener: WalletSyncListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Emits an authoritative wallet update event.
   * Dispatched by WalletTransactionService immediately upon committed transaction.
   */
  static emitWalletUpdate(payload: {
    userId: string;
    balance: number;
    bonusBalance?: number;
    lockedBalance?: number;
    rewardBalance?: number;
    cashbackBalance?: number;
    transactionId?: string;
    type?: string;
    amount?: number;
  }): WalletSyncPayload {
    const fullPayload: WalletSyncPayload = {
      userId: payload.userId,
      balance: payload.balance,
      bonusBalance: payload.bonusBalance ?? 0,
      lockedBalance: payload.lockedBalance ?? 0,
      rewardBalance: payload.rewardBalance ?? 0,
      cashbackBalance: payload.cashbackBalance ?? 0,
      transactionId: payload.transactionId,
      type: payload.type,
      amount: payload.amount,
      updatedAt: new Date().toISOString(),
    };

    // Forward to user's live socket connections via the socket bridge
    void notifyUserSocket(fullPayload.userId, "wallet:updated", fullPayload as unknown as Record<string, unknown>);

    // Notify registered in-process listeners / test observers
    for (const listener of this.listeners) {
      try {
        listener(fullPayload);
      } catch (err) {
        console.error("WalletSyncListener error:", err);
      }
    }

    return fullPayload;
  }

  /**
   * Retrieves authoritative sync state directly from persistent database.
   */
  static async getAuthoritativeSyncState(userId: string): Promise<WalletSyncPayload> {
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new AppError("NOT_FOUND", "Wallet not found", 404);
    }

    return {
      userId: wallet.userId,
      balance: wallet.balance,
      bonusBalance: wallet.bonusBalance,
      lockedBalance: wallet.lockedBalance,
      rewardBalance: wallet.rewardBalance,
      cashbackBalance: wallet.cashbackBalance,
      updatedAt: wallet.updatedAt.toISOString(),
    };
  }
}
