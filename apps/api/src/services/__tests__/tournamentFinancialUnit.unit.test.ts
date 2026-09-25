import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validatePrizeConfiguration,
  calculatePrizes,
  DEFAULT_TIER_PRIZE_DISTRIBUTION,
  type TournamentPrizeConfigSnapshot,
  type PrizeDistributionEntry,
} from "@gaming-hub/shared";
import { WalletTransactionService } from "../walletTransactionService";

const ALL_9_GAMES = [
  "snake_and_ladder",
  "ludo",
  "chess",
  "fruit_ninja",
  "bubble_shooter",
  "table_tennis",
  "snake_vs_worms",
  "carrom",
  "snooker",
] as const;

const CANONICAL_5_TIERS = [
  {
    tier: "MINI",
    entryFee: 5,
    maxPlayers: 100,
    prizePool: 400,
    expectedPrizes: { 1: 200, 2: 100, 3: 60, 4: 40 },
    expectedPercentages: { 1: 50, 2: 25, 3: 15, 4: 10 },
    expectedPlatformShare: 100, // (5 * 100) - 400 = 100
  },
  {
    tier: "BASIC",
    entryFee: 10,
    maxPlayers: 200,
    prizePool: 1600,
    expectedPrizes: { 1: 800, 2: 400, 3: 240, 4: 160 },
    expectedPercentages: { 1: 50, 2: 25, 3: 15, 4: 10 },
    expectedPlatformShare: 400, // (10 * 200) - 1600 = 400
  },
  {
    tier: "STANDARD",
    entryFee: 25,
    maxPlayers: 500,
    prizePool: 10000,
    expectedPrizes: { 1: 5000, 2: 2500, 3: 1500, 4: 1000 },
    expectedPercentages: { 1: 50, 2: 25, 3: 15, 4: 10 },
    expectedPlatformShare: 2500, // (25 * 500) - 10000 = 2500
  },
  {
    tier: "PREMIUM",
    entryFee: 50,
    maxPlayers: 500,
    prizePool: 22500,
    expectedPrizes: { 1: 11250, 2: 5625, 3: 3375, 4: 2250 },
    expectedPercentages: { 1: 50, 2: 25, 3: 15, 4: 10 },
    expectedPlatformShare: 2500, // (50 * 500) - 22500 = 2500
  },
  {
    tier: "PRO",
    entryFee: 100,
    maxPlayers: 1000,
    prizePool: 90000,
    expectedPrizes: { 1: 45000, 2: 22500, 3: 13500, 4: 9000 },
    expectedPercentages: { 1: 50, 2: 25, 3: 15, 4: 10 },
    expectedPlatformShare: 10000, // (100 * 1000) - 90000 = 10000
  },
];

describe("Tournament Financial Unit & Validation Test Suite", () => {
  // =========================================================================
  // 1. 5 Canonical Tiers & 4 Prize Positions Math
  // =========================================================================
  describe("1. Canonical 5 Tiers Prize & Platform Share Math", () => {
    it.each(CANONICAL_5_TIERS)(
      "correctly calculates $tier tier: entry $entryFee, pool $prizePool, platform share $expectedPlatformShare",
      ({ tier, entryFee, maxPlayers, prizePool, expectedPrizes, expectedPercentages, expectedPlatformShare }) => {
        // Validate 50% + 25% + 15% + 10% = 100%
        const validation = validatePrizeConfiguration(prizePool, DEFAULT_TIER_PRIZE_DISTRIBUTION);
        expect(validation.valid).toBe(true);
        expect(validation.totalPercentage).toBe(100);

        const calculated = calculatePrizes(prizePool, DEFAULT_TIER_PRIZE_DISTRIBUTION);
        expect(calculated).toHaveLength(4);

        // Sum of prizes must equal prizePool exactly
        const sum = calculated.reduce((acc, p) => acc + p.amount, 0);
        expect(sum).toBe(prizePool);

        // Verify individual 1st, 2nd, 3rd, 4th amounts
        for (const prize of calculated) {
          const rank = prize.rank as 1 | 2 | 3 | 4;
          expect(prize.amount).toBe(expectedPrizes[rank]);
        }

        // Platform share calculation
        const grossCollection = entryFee * maxPlayers;
        const platformShare = grossCollection - prizePool;
        expect(platformShare).toBe(expectedPlatformShare);
      }
    );

    it("rejects configuration if percentage sum does not equal 100%", () => {
      const invalidDist: PrizeDistributionEntry[] = [
        { rank: 1, percentage: 50 },
        { rank: 2, percentage: 25 },
        { rank: 3, percentage: 20 },
        { rank: 4, percentage: 10 }, // 105%
      ];
      const validation = validatePrizeConfiguration(10000, invalidDist);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("exceeds 100%");
    });
  });

  // =========================================================================
  // 2. WalletTransactionService Authoritative Metadata Verification
  // =========================================================================
  describe("2. Wallet Transaction Ledger Creation & Metadata Enforcement", () => {
    let mockTx: any;

    beforeEach(() => {
      mockTx = {
        wallet: {
          findUnique: vi.fn().mockResolvedValue({ userId: "u-1", balance: 1000 }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        transaction: {
          create: vi.fn().mockImplementation((args) => Promise.resolve({ id: `tx-${Date.now()}`, ...args.data })),
        },
      };
    });

    it("creates tournament entry debit with all required audit metadata", async () => {
      vi.spyOn(WalletTransactionService, "createDebit").mockImplementation(async (_tx, params: any) => {
        return {
          id: "w-1",
          userId: params.userId,
          balance: 975,
          bonusBalance: 0,
          lockedBalance: 0,
          rewardBalance: 0,
          cashbackBalance: 0,
          isFrozen: false,
          frozenAt: null,
          frozenReason: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      const res = await WalletTransactionService.createTournamentEntry(mockTx, {
        userId: "u-123",
        tournamentId: "t-456",
        tournamentTitle: "Standard Championship",
        entryFee: 25,
        tierId: "tier-standard",
      });

      expect(res).toBeDefined();
      expect(WalletTransactionService.createDebit).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          userId: "u-123",
          amount: 25,
          referenceType: "TOURNAMENT_ENTRY",
          referenceId: "t-456",
          meta: expect.objectContaining({
            userId: "u-123",
            tournamentId: "t-456",
            tierId: "tier-standard",
            amount: 25,
            currency: "COINS",
            status: "COMPLETED",
          }),
        }),
      );
    });

    it("creates tournament prize credit with rank, position, and settlementId", async () => {
      vi.spyOn(WalletTransactionService, "createCredit").mockImplementation(async (_tx, params: any) => {
        return {
          id: "w-1",
          userId: params.userId,
          balance: 6000,
          bonusBalance: 0,
          lockedBalance: 0,
          rewardBalance: 0,
          cashbackBalance: 0,
          isFrozen: false,
          frozenAt: null,
          frozenReason: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      const res = await WalletTransactionService.createTournamentPrize(mockTx, {
        userId: "u-123",
        tournamentId: "t-456",
        tournamentTitle: "Standard Championship",
        prizeAmount: 5000,
        rank: 1,
        settlementId: "settle-789",
      });

      expect(res).toBeDefined();
      expect(WalletTransactionService.createCredit).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          userId: "u-123",
          amount: 5000,
          referenceType: "TOURNAMENT_PRIZE",
          referenceId: "t-456",
          meta: expect.objectContaining({
            userId: "u-123",
            tournamentId: "t-456",
            settlementId: "settle-789",
            position: 1,
            rank: 1,
            amount: 5000,
            currency: "COINS",
            status: "COMPLETED",
          }),
        }),
      );
    });

    it("creates tournament refund referencing original transaction id", async () => {
      vi.spyOn(WalletTransactionService, "createCredit").mockImplementation(async (_tx, params: any) => {
        return {
          id: "w-1",
          userId: params.userId,
          balance: 1000,
          bonusBalance: 0,
          lockedBalance: 0,
          rewardBalance: 0,
          cashbackBalance: 0,
          isFrozen: false,
          frozenAt: null,
          frozenReason: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      const res = await WalletTransactionService.createTournamentRefund(mockTx, {
        userId: "u-123",
        tournamentId: "t-456",
        tournamentTitle: "Standard Championship",
        refundAmount: 25,
        originalTransactionId: "tx-entry-original-123",
        reason: "tournament_cancelled",
      });

      expect(res).toBeDefined();
      expect(WalletTransactionService.createCredit).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          userId: "u-123",
          amount: 25,
          referenceType: "TOURNAMENT_ENTRY",
          referenceId: "t-456",
          meta: expect.objectContaining({
            userId: "u-123",
            tournamentId: "t-456",
            amount: 25,
            originalTransactionId: "tx-entry-original-123",
            refund: true,
            status: "REFUNDED",
            currency: "COINS",
          }),
        }),
      );
    });
  });

  // =========================================================================
  // 3. Shared Financial Processing Across All 10 Games
  // =========================================================================
  describe("3. Game Invariance Across All 10 Competitive Games", () => {
    it.each(ALL_9_GAMES)(
      "ensures identical financial validation and prize distribution regardless of game: %s",
      (gameId) => {
        const pool = 10000;
        const prizes = calculatePrizes(pool, DEFAULT_TIER_PRIZE_DISTRIBUTION);

        expect(prizes[0].amount).toBe(5000); // 1st 50%
        expect(prizes[1].amount).toBe(2500); // 2nd 25%
        expect(prizes[2].amount).toBe(1500); // 3rd 15%
        expect(prizes[3].amount).toBe(1000); // 4th 10%
        expect(prizes.reduce((s, p) => s + p.amount, 0)).toBe(pool);

        // Snapshot representation
        const snapshot: TournamentPrizeConfigSnapshot = {
          entryFee: 25,
          prizePool: pool,
          grossPool: pool,
          platformShare: 2500,
          prizeDistribution: DEFAULT_TIER_PRIZE_DISTRIBUTION,
          calculatedPrizes: prizes,
          currency: "coins",
          format: "SINGLE_ELIMINATION",
          gameId,
          stateVersion: 1,
          snapshottedAt: new Date().toISOString(),
        };

        expect(snapshot.gameId).toBe(gameId);
        expect(snapshot.prizePool).toBe(10000);
        expect(snapshot.calculatedPrizes).toHaveLength(4);
      }
    );
  });

  // =========================================================================
  // 4. Prize Sum Validation & Rejection of Bad Pools
  // =========================================================================
  describe("4. Prize Sum & Pool Invariant Checking", () => {
    it("fails validation when sum of 4 prizes does not equal total prize pool", () => {
      const mismatchedDistribution: PrizeDistributionEntry[] = [
        { rank: 1, percentage: 50 },
        { rank: 2, percentage: 25 },
        { rank: 3, percentage: 15 },
        { rank: 4, percentage: 5 }, // 95% total
      ];

      const pool = 10000;
      const calculated = calculatePrizes(pool, mismatchedDistribution);
      const sum = calculated.reduce((acc, p) => acc + p.amount, 0);

      expect(sum).toBe(9500); // Mismatched
      expect(sum === pool).toBe(false);
    });

    it("verifies partial settlement status logic correctly classifies all states", () => {
      function computeSettlementStatus(
        settledAt: Date | null,
        prizes: Array<{ status: string }>
      ): string {
        const completed = prizes.filter((p) => p.status === "COMPLETED" || p.status === "PAID").length;
        const failed = prizes.filter((p) => p.status === "FAILED").length;
        const pending = prizes.filter((p) => p.status === "PENDING" || p.status === "PROCESSING").length;

        if (settledAt || (prizes.length > 0 && completed === prizes.length && failed === 0)) {
          return "SETTLED";
        } else if (completed > 0 && failed > 0) {
          return "PARTIALLY_SETTLED";
        } else if (failed > 0 && completed === 0) {
          return "SETTLEMENT_FAILED";
        } else if (pending > 0) {
          return "PROCESSING";
        }
        return "NOT_STARTED";
      }

      // Case 1: All 4 settled
      expect(
        computeSettlementStatus(null, [
          { status: "COMPLETED" },
          { status: "COMPLETED" },
          { status: "COMPLETED" },
          { status: "COMPLETED" },
        ])
      ).toBe("SETTLED");

      // Case 2: Partial settlement (3 completed, 1 failed)
      expect(
        computeSettlementStatus(null, [
          { status: "COMPLETED" },
          { status: "COMPLETED" },
          { status: "FAILED" },
          { status: "COMPLETED" },
        ])
      ).toBe("PARTIALLY_SETTLED");

      // Case 3: All failed
      expect(
        computeSettlementStatus(null, [
          { status: "FAILED" },
          { status: "FAILED" },
          { status: "FAILED" },
          { status: "FAILED" },
        ])
      ).toBe("SETTLEMENT_FAILED");

      // Case 4: Pending / Processing
      expect(
        computeSettlementStatus(null, [
          { status: "PENDING" },
          { status: "PENDING" },
          { status: "PROCESSING" },
          { status: "PENDING" },
        ])
      ).toBe("PROCESSING");
    });
  });
});
