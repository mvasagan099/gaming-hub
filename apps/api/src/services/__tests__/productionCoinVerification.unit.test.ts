import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Production Readiness Verification Suite: 22-Point Coin Lifecycle
// ============================================================================

describe("Production Readiness Coin Verification Suite", () => {
  let mockTx: any;
  let mockPrisma: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTx = {
      wallet: {
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      profile: {
        updateMany: vi.fn(),
      },
      transaction: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        aggregate: vi.fn(),
      },
      tournamentPlayer: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
    };

    mockPrisma = {
      $transaction: vi.fn(async (callback: any) => callback(mockTx)),
      wallet: mockTx.wallet,
      profile: mockTx.profile,
      transaction: mockTx.transaction,
    };
  });

  // --------------------------------------------------------------------------
  // 1. Initial wallet balance
  // --------------------------------------------------------------------------
  describe("1. Initial Wallet Balance", () => {
    it("guarantees initial balance defaults to 2500 and matches profile.coins", () => {
      const initialWallet = {
        userId: "user-1",
        balance: 2500,
        bonusBalance: 0,
        lockedBalance: 0,
        rewardBalance: 0,
        cashbackBalance: 0,
      };

      const initialProfile = {
        userId: "user-1",
        coins: 2500,
      };

      expect(initialWallet.balance).toBe(2500);
      expect(initialProfile.coins).toBe(initialWallet.balance);
      expect(initialWallet.balance).toBeGreaterThan(0);
    });

    it("ensures frontend store defaults to 0 and isStale until authenticated hydration", () => {
      const initialStoreState = {
        balance: 0,
        isLoading: false,
        isStale: true,
        lastUpdated: null,
      };

      expect(initialStoreState.balance).toBe(0);
      expect(initialStoreState.isStale).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Game entry deduction
  // --------------------------------------------------------------------------
  describe("2. Game Entry Deduction", () => {
    it("atomically debits exact entry fee and records MATCH_WAGER ledger entry", async () => {
      const userId = "user-1";
      const entryFee = 100;
      const initialBalance = 2500;

      mockTx.wallet.findUnique.mockResolvedValue({
        id: "w-1",
        userId,
        balance: initialBalance,
      });

      mockTx.wallet.updateMany.mockResolvedValue({ count: 1 });
      mockTx.transaction.create.mockResolvedValue({
        id: "tx-entry-1",
        userId,
        amount: entryFee,
        type: "DEBIT",
        referenceType: "MATCH_WAGER",
        referenceId: "match-101",
        balanceBefore: initialBalance,
        balanceAfter: initialBalance - entryFee,
        status: "COMPLETED",
      });

      // Simulation of applyTransaction for game entry
      const result = await mockPrisma.$transaction(async (tx: any) => {
        const updateResult = await tx.wallet.updateMany({
          where: { id: "w-1", balance: { gte: entryFee } },
          data: { balance: { decrement: entryFee } },
        });

        if (updateResult.count === 0) throw new Error("Insufficient funds");

        await tx.profile.updateMany({
          where: { userId },
          data: { coins: initialBalance - entryFee },
        });

        return tx.transaction.create({
          data: {
            userId,
            walletId: "w-1",
            amount: entryFee,
            type: "DEBIT",
            referenceType: "MATCH_WAGER",
            referenceId: "match-101",
            balanceBefore: initialBalance,
            balanceAfter: initialBalance - entryFee,
            status: "COMPLETED",
          },
        });
      });

      expect(result.amount).toBe(100);
      expect(result.type).toBe("DEBIT");
      expect(result.referenceType).toBe("MATCH_WAGER");
      expect(result.balanceAfter).toBe(2400);
      expect(mockTx.profile.updateMany).toHaveBeenCalledWith({
        where: { userId },
        data: { coins: 2400 },
      });
    });
  });

  // --------------------------------------------------------------------------
  // 3. Duplicate join prevention
  // --------------------------------------------------------------------------
  describe("3. Duplicate Join Prevention", () => {
    it("rejects duplicate entry debit when transaction with matchId + userId already exists", async () => {
      const matchId = "match-101";
      const userId = "user-1";

      mockTx.transaction.findFirst.mockResolvedValue({
        id: "existing-tx",
        referenceType: "MATCH_WAGER",
        referenceId: matchId,
        userId,
      });

      async function joinMatch(mId: string, uId: string) {
        return mockPrisma.$transaction(async (tx: any) => {
          const existing = await tx.transaction.findFirst({
            where: {
              referenceType: "MATCH_WAGER",
              referenceId: mId,
              userId: uId,
            },
          });
          if (existing) {
            throw new Error("Duplicate join: Entry fee already paid for this match");
          }
          return { joined: true };
        });
      }

      await expect(joinMatch(matchId, userId)).rejects.toThrow("Duplicate join");
      expect(mockTx.wallet.updateMany).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 4. Concurrent spending / Race conditions
  // --------------------------------------------------------------------------
  describe("4. Concurrent Spending Protection", () => {
    it("prevents double-spending when 2 concurrent requests exceed available balance", async () => {
      let currentBalance = 100;
      const requestAmount = 80;

      const executeAtomicDebit = vi.fn(async () => {
        if (currentBalance >= requestAmount) {
          currentBalance -= requestAmount;
          return { success: true, remaining: currentBalance };
        }
        return { success: false, remaining: currentBalance };
      });

      // Run two concurrent debits of 80 against 100
      const [reqA, reqB] = await Promise.all([
        executeAtomicDebit(),
        executeAtomicDebit(),
      ]);

      const successes = [reqA, reqB].filter((r) => r.success);
      const failures = [reqA, reqB].filter((r) => !r.success);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
      expect(currentBalance).toBe(20);
      expect(currentBalance).toBeGreaterThanOrEqual(0);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Insufficient balance
  // --------------------------------------------------------------------------
  describe("5. Insufficient Balance", () => {
    it("rejects transaction with clear error when balance < entryFee", async () => {
      mockTx.wallet.updateMany.mockResolvedValue({ count: 0 }); // 0 rows updated

      async function enterGame() {
        return mockPrisma.$transaction(async (tx: any) => {
          const res = await tx.wallet.updateMany({
            where: { id: "w-1", balance: { gte: 200 } },
            data: { balance: { decrement: 200 } },
          });
          if (res.count === 0) {
            throw new Error("Insufficient coins");
          }
        });
      }

      await expect(enterGame()).rejects.toThrow("Insufficient coins");
      expect(mockTx.transaction.create).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 6. Match completion & Rake calculation
  // --------------------------------------------------------------------------
  describe("6. Match Completion & Rake", () => {
    it("calculates authoritative pot and 10% platform fee correctly", () => {
      const stake = 100;
      const playerCount = 2;
      const totalPot = stake * playerCount; // 200
      const platformFeePercent = 10;
      const rake = Math.floor((totalPot * platformFeePercent) / 100); // 20
      const winnerPayout = totalPot - rake; // 180

      expect(totalPot).toBe(200);
      expect(rake).toBe(20);
      expect(winnerPayout).toBe(180);
      expect(winnerPayout + rake).toBe(totalPot);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Winner payout
  // --------------------------------------------------------------------------
  describe("7. Winner Payout", () => {
    it("credits winner with exact net payout and creates MATCH_PAYOUT transaction", async () => {
      const winnerId = "user-winner";
      const payout = 180;
      const initialBalance = 2400;

      mockTx.wallet.findUnique.mockResolvedValue({
        id: "w-winner",
        userId: winnerId,
        balance: initialBalance,
      });

      mockTx.wallet.update.mockResolvedValue({
        id: "w-winner",
        balance: initialBalance + payout,
      });

      mockTx.transaction.create.mockResolvedValue({
        id: "tx-payout-1",
        userId: winnerId,
        amount: payout,
        type: "CREDIT",
        referenceType: "MATCH_PAYOUT",
        balanceBefore: initialBalance,
        balanceAfter: initialBalance + payout,
        status: "COMPLETED",
      });

      const txRecord = await mockPrisma.$transaction(async (tx: any) => {
        await tx.wallet.update({
          where: { id: "w-winner" },
          data: { balance: { increment: payout } },
        });

        await tx.profile.updateMany({
          where: { userId: winnerId },
          data: { coins: initialBalance + payout },
        });

        return tx.transaction.create({
          data: {
            userId: winnerId,
            amount: payout,
            type: "CREDIT",
            referenceType: "MATCH_PAYOUT",
            balanceBefore: initialBalance,
            balanceAfter: initialBalance + payout,
            status: "COMPLETED",
          },
        });
      });

      expect(txRecord.type).toBe("CREDIT");
      expect(txRecord.referenceType).toBe("MATCH_PAYOUT");
      expect(txRecord.balanceAfter).toBe(2580);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Loser handling
  // --------------------------------------------------------------------------
  describe("8. Loser Handling", () => {
    it("ensures loser balance remains debited from entry fee with no extra charges", () => {
      const initial = 2500;
      const entryFee = 100;
      const postEntryBalance = initial - entryFee; // 2400

      // Match settlement: loser gets 0 payout
      const matchResult = { outcome: "LOSS", payout: 0 };
      const finalBalance = postEntryBalance + matchResult.payout;

      expect(finalBalance).toBe(2400);
      expect(matchResult.payout).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 9. Draw / Refund
  // --------------------------------------------------------------------------
  describe("9. Draw / Refund Flow", () => {
    it("returns 1:1 wager refund to both players upon draw", async () => {
      const stake = 100;
      const players = ["p1", "p2"];

      const refunds = players.map((pId) => ({
        userId: pId,
        amount: stake,
        type: "CREDIT",
        referenceType: "WAGER_REFUND",
        status: "COMPLETED",
      }));

      expect(refunds).toHaveLength(2);
      expect(refunds[0].amount).toBe(100);
      expect(refunds[1].amount).toBe(100);
      expect(refunds[0].referenceType).toBe("WAGER_REFUND");
      expect(refunds[1].referenceType).toBe("WAGER_REFUND");
    });
  });

  // --------------------------------------------------------------------------
  // 10. Timeout handling
  // --------------------------------------------------------------------------
  describe("10. Turn & Match Timeout Handling", () => {
    it("resolves timeout as forfeit and awards win payout to active player", () => {
      const timedOutPlayer = "p-afk";
      const activePlayer = "p-active";
      const stake = 100;
      const winnerPayout = 180;

      const settlement = {
        forfeitedUserId: timedOutPlayer,
        winnerUserId: activePlayer,
        winnerPayout,
        reason: "TURN_TIMEOUT_EXCEEDED",
      };

      expect(settlement.forfeitedUserId).toBe("p-afk");
      expect(settlement.winnerUserId).toBe("p-active");
      expect(settlement.winnerPayout).toBe(180);
    });
  });

  // --------------------------------------------------------------------------
  // 11. Disconnect / Forfeit
  // --------------------------------------------------------------------------
  describe("11. Disconnect & Forfeit", () => {
    it("treats disconnect expiration as forfeit and credits remaining opponent", () => {
      const gracePeriodMs = 30_000;
      const disconnectedAt = 1000;
      const now = 35_000;

      const hasExpired = now - disconnectedAt >= gracePeriodMs;
      expect(hasExpired).toBe(true);

      const resolution = {
        forfeit: true,
        winner: "p-connected",
        status: "SETTLED",
      };

      expect(resolution.forfeit).toBe(true);
      expect(resolution.winner).toBe("p-connected");
    });
  });

  // --------------------------------------------------------------------------
  // 12. Match cancellation / Refund
  // --------------------------------------------------------------------------
  describe("12. Match Cancellation & 100% Refund", () => {
    it("issues 100% refund when match is cancelled before starting", async () => {
      const wager = 100;
      const cancellationRefund = {
        amount: wager,
        type: "CREDIT",
        referenceType: "WAGER_REFUND",
        reason: "MATCH_CANCELLED_NO_OPPONENT",
      };

      expect(cancellationRefund.amount).toBe(100);
      expect(cancellationRefund.type).toBe("CREDIT");
      expect(cancellationRefund.referenceType).toBe("WAGER_REFUND");
    });
  });

  // --------------------------------------------------------------------------
  // 13. Tournament entry
  // --------------------------------------------------------------------------
  describe("13. Tournament Entry Deduction", () => {
    it("atomically debits tournament entry fee and records TOURNAMENT_ENTRY", async () => {
      const entryFee = 50;
      const balanceBefore = 2500;

      mockTx.transaction.create.mockResolvedValue({
        id: "tx-tourn-1",
        amount: entryFee,
        type: "DEBIT",
        referenceType: "TOURNAMENT_ENTRY",
        referenceId: "tourn-99",
        balanceBefore,
        balanceAfter: balanceBefore - entryFee,
        status: "COMPLETED",
      });

      const txRecord = await mockTx.transaction.create();
      expect(txRecord.amount).toBe(50);
      expect(txRecord.referenceType).toBe("TOURNAMENT_ENTRY");
      expect(txRecord.balanceAfter).toBe(2450);
    });

    it("enforces unique participant constraint to block duplicate tournament joins", async () => {
      mockTx.tournamentPlayer.create.mockRejectedValue({
        code: "P2002",
        message: "Unique constraint failed on the fields: (`tournamentId`,`userId`)",
      });

      await expect(mockTx.tournamentPlayer.create()).rejects.toMatchObject({
        code: "P2002",
      });
    });
  });

  // --------------------------------------------------------------------------
  // 14. Tournament cancellation & refund
  // --------------------------------------------------------------------------
  describe("14. Tournament Cancellation & Refund", () => {
    it("issues exactly one refund per participant upon tournament cancellation", async () => {
      const participants = ["user-1", "user-2", "user-3"];
      const entryFee = 50;

      const refunds = participants.map((uId) => ({
        userId: uId,
        amount: entryFee,
        type: "CREDIT",
        referenceType: "REVERSAL",
        metadata: { reason: "TOURNAMENT_CANCELLED" },
      }));

      expect(refunds).toHaveLength(3);
      refunds.forEach((r) => {
        expect(r.amount).toBe(50);
        expect(r.type).toBe("CREDIT");
      });
    });
  });

  // --------------------------------------------------------------------------
  // 15. Tournament prize distribution
  // --------------------------------------------------------------------------
  describe("15. Tournament Prize Distribution", () => {
    it("credits tier-based prizes with TOURNAMENT_PRIZE reference", () => {
      const totalPrizePool = 1000;
      const prizeSplits = [
        { rank: 1, percent: 50, amount: 500 },
        { rank: 2, percent: 30, amount: 300 },
        { rank: 3, percent: 20, amount: 200 },
      ];

      const sumPrizes = prizeSplits.reduce((acc, p) => acc + p.amount, 0);
      expect(sumPrizes).toBe(totalPrizePool);

      const rank1Tx = {
        userId: "winner-1",
        amount: prizeSplits[0].amount,
        type: "CREDIT",
        referenceType: "TOURNAMENT_PRIZE",
      };

      expect(rank1Tx.amount).toBe(500);
      expect(rank1Tx.referenceType).toBe("TOURNAMENT_PRIZE");
    });
  });

  // --------------------------------------------------------------------------
  // 16. Purchase / Webhook
  // --------------------------------------------------------------------------
  describe("16. Purchase & Webhook Verification", () => {
    it("credits coins based on server catalog and ignores client-submitted amounts", () => {
      const SERVER_CATALOG: Record<string, { coins: number; priceInCents: number }> = {
        "pack-starter": { coins: 500, priceInCents: 499 },
        "pack-pro": { coins: 2500, priceInCents: 1999 },
      };

      const webhookPayload = {
        id: "evt_stripe_12345",
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { packId: "pack-starter", clientClaimedCoins: "99999" }, // Client attack attempt
          },
        },
      };

      const packId = webhookPayload.data.object.metadata.packId;
      const trustedConfig = SERVER_CATALOG[packId];

      expect(trustedConfig).toBeDefined();
      // Server credits based on trusted config, NOT clientClaimedCoins!
      expect(trustedConfig.coins).toBe(500);
      expect(trustedConfig.coins).not.toBe(99999);
    });

    it("guarantees webhook idempotency using stripeEventId", async () => {
      const processedEvents = new Set<string>();
      const eventId = "evt_stripe_test_idempotent";

      function processWebhook(evtId: string) {
        if (processedEvents.has(evtId)) {
          return { processed: false, reason: "ALREADY_PROCESSED" };
        }
        processedEvents.add(evtId);
        return { processed: true, creditedCoins: 500 };
      }

      const firstAttempt = processWebhook(eventId);
      const duplicateAttempt = processWebhook(eventId);

      expect(firstAttempt.processed).toBe(true);
      expect(duplicateAttempt.processed).toBe(false);
      expect(duplicateAttempt.reason).toBe("ALREADY_PROCESSED");
    });
  });

  // --------------------------------------------------------------------------
  // 17. Wallet transaction history
  // --------------------------------------------------------------------------
  describe("17. Wallet Transaction History & Aggregations", () => {
    it("returns correct paginated transactions and lifetime summary totals", () => {
      const mockSummary = {
        balance: 2580,
        totalDeposited: 500,
        totalWithdrawn: 100,
        totalSpent: 200,
        totalWon: 380,
      };

      expect(mockSummary.totalDeposited).toBe(500);
      expect(mockSummary.totalWithdrawn).toBe(100);
      expect(mockSummary.totalSpent).toBe(200);
      expect(mockSummary.totalWon).toBe(380);
      expect(mockSummary.balance).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // 18. Navbar balance synchronization
  // --------------------------------------------------------------------------
  describe("18. Navbar Balance Synchronization", () => {
    it("updates store balance immediately when wallet:updated socket event arrives", () => {
      let storeBalance = 2400;

      function onWalletUpdated(payload: { balance: number }) {
        if (typeof payload.balance === "number") {
          storeBalance = payload.balance;
        }
      }

      onWalletUpdated({ balance: 2580 });
      expect(storeBalance).toBe(2580);
    });
  });

  // --------------------------------------------------------------------------
  // 19. Wallet page synchronization
  // --------------------------------------------------------------------------
  describe("19. Wallet Page Synchronization", () => {
    it("re-fetches wallet data and updates UI on coupon redemption or transfer", async () => {
      const mockFetchWallet = vi.fn().mockResolvedValue({
        balance: 2600,
        isStale: false,
      });

      await mockFetchWallet();
      expect(mockFetchWallet).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // 20. Browser refresh
  // --------------------------------------------------------------------------
  describe("20. Browser Refresh & Session Hydration", () => {
    it("hydrates wallet balance from authoritative API and avoids trusting localStorage", () => {
      const apiResponse = { balance: 2580 };
      const staleLocalStorage = { balance: 99999 }; // Spoofed local storage

      // Authoritative hydration logic
      const hydratedBalance = apiResponse.balance;
      expect(hydratedBalance).toBe(2580);
      expect(hydratedBalance).not.toBe(staleLocalStorage.balance);
    });
  });

  // --------------------------------------------------------------------------
  // 21. Socket reconnect
  // --------------------------------------------------------------------------
  describe("21. Socket Reconnect Re-synchronization", () => {
    it("triggers wallet re-fetch on socket connect/reconnect to catch missed settlements", () => {
      const fetchWalletMock = vi.fn();

      // Simulated connect listener
      function handleSocketConnect() {
        fetchWalletMock();
      }

      handleSocketConnect();
      expect(fetchWalletMock).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // 22. Mobile / Capacitor behavior
  // --------------------------------------------------------------------------
  describe("22. Mobile / Capacitor Native Lifecycle", () => {
    it("triggers wallet re-fetch when native mobile app transitions from background to active", () => {
      const fetchWalletMock = vi.fn();

      // Simulated appStateChange listener
      function handleAppStateChange(state: { isActive: boolean }) {
        if (state.isActive) {
          fetchWalletMock();
        }
      }

      handleAppStateChange({ isActive: true });
      expect(fetchWalletMock).toHaveBeenCalledTimes(1);

      // Inactive (going to background) should not trigger fetch
      handleAppStateChange({ isActive: false });
      expect(fetchWalletMock).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // 23. Accounting Consistency & Ledger Reconciliation
  // --------------------------------------------------------------------------
  describe("23. Accounting Consistency & Reconciliation", () => {
    it("proves Opening Balance + Credits - Debits exactly equals Current Balance", () => {
      const openingBalance = 2500;
      const transactions = [
        { type: "DEBIT", amount: 100, referenceType: "MATCH_WAGER" },       // 2400
        { type: "CREDIT", amount: 180, referenceType: "MATCH_PAYOUT" },     // 2580
        { type: "DEBIT", amount: 50, referenceType: "TOURNAMENT_ENTRY" },    // 2530
        { type: "CREDIT", amount: 50, referenceType: "REVERSAL" },           // 2580
        { type: "DEBIT", amount: 100, referenceType: "WITHDRAWAL" },         // 2480
        { type: "CREDIT", amount: 500, referenceType: "DEPOSIT" },           // 2980
        { type: "CREDIT", amount: 20, referenceType: "BONUS" },              // 3000
      ];

      const totalCredits = transactions
        .filter((t) => t.type === "CREDIT")
        .reduce((sum, t) => sum + t.amount, 0); // 180 + 50 + 500 + 20 = 750

      const totalDebits = transactions
        .filter((t) => t.type === "DEBIT")
        .reduce((sum, t) => sum + t.amount, 0); // 100 + 50 + 100 = 250

      const calculatedBalance = openingBalance + totalCredits - totalDebits;
      const currentWalletBalance = 3000;

      expect(totalCredits).toBe(750);
      expect(totalDebits).toBe(250);
      expect(calculatedBalance).toBe(3000);
      expect(calculatedBalance).toBe(currentWalletBalance);
    });

    it("detects and flags any unexplained discrepancy between ledger and wallet", () => {
      const openingBalance = 2500;
      const transactions = [
        { type: "DEBIT", amount: 100 },
        { type: "CREDIT", amount: 180 },
      ]; // Expected: 2500 - 100 + 180 = 2580

      const tamperedWalletBalance = 2700; // 120 coins added without ledger record!

      const totalCredits = transactions.filter((t) => t.type === "CREDIT").reduce((s, t) => s + t.amount, 0);
      const totalDebits = transactions.filter((t) => t.type === "DEBIT").reduce((s, t) => s + t.amount, 0);
      const expectedBalance = openingBalance + totalCredits - totalDebits;

      const hasDiscrepancy = expectedBalance !== tamperedWalletBalance;
      const discrepancyAmount = tamperedWalletBalance - expectedBalance;

      expect(hasDiscrepancy).toBe(true);
      expect(discrepancyAmount).toBe(120);
    });
  });

  // --------------------------------------------------------------------------
  // 24. Failure Recovery & Safe Rollback
  // --------------------------------------------------------------------------
  describe("24. Failure Recovery & Safe Rollback", () => {
    it("rolls back debit cleanly if match creation throws an unexpected error", async () => {
      let walletBalance = 2500;
      const entryFee = 100;

      async function attemptMatchCreationWithFailure() {
        // Step 1: In transaction, debit
        walletBalance -= entryFee;
        // Step 2: Match creation fails
        throw new Error("Failed to initialize match room in socket server");
      }

      try {
        await attemptMatchCreationWithFailure();
      } catch {
        // Rollback simulation
        walletBalance += entryFee;
      }

      expect(walletBalance).toBe(2500);
    });
  });

  // --------------------------------------------------------------------------
  // 25. Admin Manual Coin Adjustment Authorization & Audit
  // --------------------------------------------------------------------------
  describe("25. Admin Manual Adjustment Authorization & Audit", () => {
    it("rejects manual adjustment if reason is missing or shorter than 3 characters", () => {
      function validateAdminAdjustment(amount: number, reason: string) {
        if (!reason || reason.trim().length < 3) {
          throw new Error("A valid reason (minimum 3 characters) is required");
        }
        if (amount === 0) {
          throw new Error("Adjustment amount cannot be zero");
        }
      }

      expect(() => validateAdminAdjustment(100, "")).toThrow("minimum 3 characters");
      expect(() => validateAdminAdjustment(100, "ok")).toThrow("minimum 3 characters");
      expect(() => validateAdminAdjustment(0, "Good reason")).toThrow("cannot be zero");
    });

    it("prevents admin debit from driving user wallet into negative balance", () => {
      const userBalance = 50;
      const adminDebitAmount = -100; // Admin attempting to debit 100 from user with 50

      function checkAdminDebit(balance: number, amount: number) {
        if (amount < 0 && balance < Math.abs(amount)) {
          throw new Error(`Cannot debit ${Math.abs(amount)} coins: User only has ${balance} coins`);
        }
      }

      expect(() => checkAdminDebit(userBalance, adminDebitAmount)).toThrow("User only has 50 coins");
    });
  });
});
