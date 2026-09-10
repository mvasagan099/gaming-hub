import { describe, it, expect, vi, beforeEach } from "vitest";
import { WalletSyncService } from "../walletSyncService";
import { WalletTransactionService } from "../walletTransactionService";
import { WalletHistoryService } from "../walletHistoryService";
import { socketBridge, resetSocketBridge } from "../socketBridge";
import type { Transaction } from "@gaming-hub/db";

describe("Coin Workflow Comprehensive Audit Unit Tests", () => {
  beforeEach(() => {
    resetSocketBridge();
  });

  describe("1. Real-Time Balance Synchronization Bridge", () => {
    it("automatically dispatches wallet:updated event via socketBridge on emitWalletUpdate", () => {
      const payload = {
        userId: "user-sync-test-1",
        balance: 1450,
        bonusBalance: 50,
        lockedBalance: 0,
        rewardBalance: 100,
        cashbackBalance: 0,
        transactionId: "tx-sync-101",
        type: "CREDIT",
        amount: 250,
      };

      const emitted = WalletSyncService.emitWalletUpdate(payload);

      expect(emitted.userId).toBe(payload.userId);
      expect(emitted.balance).toBe(1450);

      // Verify the socket bridge captured the push
      expect(socketBridge.calls).toHaveLength(1);
      const call = socketBridge.calls[0];
      expect(call.userId).toBe(payload.userId);
      expect(call.event).toBe("wallet:updated");
      expect(call.payload.balance).toBe(1450);
      expect(call.payload.amount).toBe(250);
      expect(call.payload.type).toBe("CREDIT");
    });

    it("notifies custom in-process listeners alongside socket bridge", () => {
      const events: any[] = [];
      const unsubscribe = WalletSyncService.registerSyncListener((p) => {
        events.push(p);
      });

      WalletSyncService.emitWalletUpdate({
        userId: "user-sync-test-2",
        balance: 900,
        type: "DEBIT",
        amount: 100,
      });

      unsubscribe();

      expect(events).toHaveLength(1);
      expect(events[0].balance).toBe(900);
      expect(events[0].amount).toBe(100);
      expect(socketBridge.calls).toHaveLength(1);
      expect(socketBridge.calls[0].event).toBe("wallet:updated");
    });
  });

  describe("2. Transaction Ledger Formatting & Balance Snapshots", () => {
    it("formats a DEBIT transaction correctly calculating balanceBefore and direction", () => {
      const mockDebitTx: Transaction = {
        id: "tx-debit-1",
        userId: "user-test-debit",
        type: "DEBIT",
        amount: 50,
        balanceBefore: 500,
        balanceAfter: 450,
        walletType: "MAIN",
        referenceType: "MATCH_WAGER",
        referenceId: "match-123",
        meta: { balanceBefore: 500, balanceAfter: 450, direction: "DEBIT" },
        createdAt: new Date("2026-09-10T00:00:00Z"),
      };

      const dto = WalletTransactionService.formatTransaction(mockDebitTx);
      expect(dto.id).toBe("tx-debit-1");
      expect(dto.direction).toBe("DEBIT");
      expect(dto.amount).toBe(50);
      expect(dto.balanceBefore).toBe(500);
      expect(dto.balanceAfter).toBe(450);
      expect(dto.referenceType).toBe("MATCH_WAGER");
    });

    it("formats a CREDIT transaction correctly calculating balanceBefore and direction", () => {
      const mockCreditTx: Transaction = {
        id: "tx-credit-1",
        userId: "user-test-credit",
        type: "CREDIT",
        amount: 180,
        balanceBefore: 450,
        balanceAfter: 630,
        walletType: "MAIN",
        referenceType: "MATCH_PAYOUT",
        referenceId: "match-123",
        meta: { balanceBefore: 450, balanceAfter: 630, direction: "CREDIT" },
        createdAt: new Date("2026-09-10T00:10:00Z"),
      };

      const dto = WalletTransactionService.formatTransaction(mockCreditTx);
      expect(dto.id).toBe("tx-credit-1");
      expect(dto.direction).toBe("CREDIT");
      expect(dto.amount).toBe(180);
      expect(dto.balanceBefore).toBe(450);
      expect(dto.balanceAfter).toBe(630);
      expect(dto.referenceType).toBe("MATCH_PAYOUT");
    });
  });

  describe("3. Atomic Debit & Credit Input Validation", () => {
    it("rejects zero or negative debit amounts", async () => {
      const mockTx = {} as any;
      await expect(
        WalletTransactionService.createDebit(mockTx, {
          userId: "user-val-1",
          amount: 0,
          referenceType: "MATCH_WAGER",
          referenceId: "m1",
        }),
      ).rejects.toThrow(/Debit amount must be positive/i);

      await expect(
        WalletTransactionService.createDebit(mockTx, {
          userId: "user-val-1",
          amount: -50,
          referenceType: "MATCH_WAGER",
          referenceId: "m1",
        }),
      ).rejects.toThrow(/Debit amount must be positive/i);
    });

    it("rejects zero or negative credit amounts", async () => {
      const mockTx = {} as any;
      await expect(
        WalletTransactionService.createCredit(mockTx, {
          userId: "user-val-1",
          amount: 0,
          referenceType: "MATCH_PAYOUT",
          referenceId: "m1",
        }),
      ).rejects.toThrow(/Credit amount must be positive/i);

      await expect(
        WalletTransactionService.createCredit(mockTx, {
          userId: "user-val-1",
          amount: -100,
          referenceType: "MATCH_PAYOUT",
          referenceId: "m1",
        }),
      ).rejects.toThrow(/Credit amount must be positive/i);
    });
  });

  describe("4. Wallet History Turnover and Summary Aggregation", () => {
    it("aggregates deposits, withdrawals, winnings, entry fees, and turnover accurately without fake mock figures", async () => {
      const { prisma } = await import("@gaming-hub/db");

      const mockWallet = {
        userId: "user-summary-test",
        balance: 1200,
        bonusBalance: 150,
        lockedBalance: 0,
        rewardBalance: 50,
        cashbackBalance: 20,
        isFrozen: false,
        updatedAt: new Date(),
      };

      const mockTransactions = [
        { type: "CREDIT", amount: 500, referenceType: "DEPOSIT" },
        { type: "CREDIT", amount: 100, referenceType: "COUPON" },
        { type: "CREDIT", amount: 50, referenceType: "BONUS" },
        { type: "DEBIT", amount: 200, referenceType: "WITHDRAWAL" },
        { type: "DEBIT", amount: 100, referenceType: "MATCH_WAGER" },
        { type: "DEBIT", amount: 50, referenceType: "TOURNAMENT_ENTRY" },
        { type: "CREDIT", amount: 180, referenceType: "MATCH_PAYOUT" },
        { type: "CREDIT", amount: 300, referenceType: "TOURNAMENT_PRIZE" },
        { type: "CREDIT", amount: 100, referenceType: "WAGER_REFUND" },
      ];

      vi.spyOn(prisma.wallet, "findUnique").mockResolvedValueOnce(mockWallet as any);
      vi.spyOn(prisma.transaction, "findMany").mockResolvedValueOnce(mockTransactions as any);

      const summary = await WalletHistoryService.getUserWalletSummary("user-summary-test");

      expect(summary.balance).toBe(1200);
      expect(summary.totalDeposited).toBe(650); // 500 + 100 + 50
      expect(summary.totalWithdrawn).toBe(200); // 200
      expect(summary.totalSpent).toBe(150); // 100 + 50
      expect(summary.totalWon).toBe(480); // 180 + 300
      expect(summary.totalCredits).toBe(1230); // 500+100+50+180+300+100
      expect(summary.totalDebits).toBe(350); // 200+100+50
      expect(summary.totalWinnings).toBe(480);
      expect(summary.totalEntryFees).toBe(150);
      expect(summary.totalRefunds).toBe(100);
      expect(summary.transactionCount).toBe(9);
    });
  });
});
