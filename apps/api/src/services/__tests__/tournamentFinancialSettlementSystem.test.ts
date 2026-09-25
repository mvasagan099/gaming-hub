import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@gaming-hub/db";
import {
  validatePrizeConfiguration,
  calculatePrizes,
  DEFAULT_TIER_PRIZE_DISTRIBUTION,
  type TournamentPrizeConfigSnapshot,
} from "@gaming-hub/shared";
import { TournamentSettlementService } from "../tournamentSettlementService";
import { WalletTransactionService } from "../walletTransactionService";
import { RefundService } from "../refundService";
import {
  registerForTournament,
  cancelRegistration,
  getRegistrationInfo,
} from "../tournaments";

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
    name: "MINI",
    entryFee: 5,
    maxPlayers: 100,
    prizePool: 400,
    expectedPrizes: { 1: 200, 2: 100, 3: 60, 4: 40 },
    expectedPlatformShare: 100, // 500 - 400 = 100
  },
  {
    name: "BASIC",
    entryFee: 10,
    maxPlayers: 200,
    prizePool: 1600,
    expectedPrizes: { 1: 800, 2: 400, 3: 240, 4: 160 },
    expectedPlatformShare: 400, // 2000 - 1600 = 400
  },
  {
    name: "STANDARD",
    entryFee: 25,
    maxPlayers: 500,
    prizePool: 10000,
    expectedPrizes: { 1: 5000, 2: 2500, 3: 1500, 4: 1000 },
    expectedPlatformShare: 2500, // 12500 - 10000 = 2500
  },
  {
    name: "PREMIUM",
    entryFee: 50,
    maxPlayers: 500,
    prizePool: 22500,
    expectedPrizes: { 1: 11250, 2: 5625, 3: 3375, 4: 2250 },
    expectedPlatformShare: 2500, // 25000 - 22500 = 2500
  },
  {
    name: "PRO",
    entryFee: 100,
    maxPlayers: 1000,
    prizePool: 90000,
    expectedPrizes: { 1: 45000, 2: 22500, 3: 13500, 4: 9000 },
    expectedPlatformShare: 10000, // 100000 - 90000 = 10000
  },
];

describe("Complete Tournament Financial Transaction & Settlement System", () => {
  const createdTournamentIds: string[] = [];
  const createdUserIds: string[] = [];

  async function createTestUser(displayName: string, initialBalance = 1000) {
    const id = `u_fin_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const rand = Math.random().toString(36).slice(2, 8);
    createdUserIds.push(id);

    return prisma.user.create({
      data: {
        id,
        email: `usr_${Date.now().toString(36)}_${rand}@gaminghub.test`,
        username: `u_${Date.now().toString(36)}_${rand}`,
        displayName,
        profile: { create: {} },
        wallet: { create: { balance: initialBalance } },
      },
      include: { wallet: true },
    });
  }

  async function createTestTournament(data: {
    title: string;
    gameId: string;
    prizePool: number;
    grossPool?: number;
    entryFee?: number;
    status?: any;
    format?: any;
    minPlayers?: number;
    maxPlayers?: number;
    prizeDistribution?: any;
    configSnapshot?: any;
  }) {
    const id = `tourn_fin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    createdTournamentIds.push(id);

    return prisma.tournament.create({
      data: {
        id,
        title: data.title,
        description: `${data.title} description`,
        gameId: data.gameId,
        format: data.format || "SINGLE_ELIMINATION",
        status: data.status || "REGISTRATION_OPEN",
        prizePool: data.prizePool,
        grossPool: data.grossPool || data.prizePool,
        entryFee: data.entryFee || 0,
        minPlayers: data.minPlayers || 4,
        maxPlayers: data.maxPlayers || 100,
        prizeDistribution: data.prizeDistribution || DEFAULT_TIER_PRIZE_DISTRIBUTION,
        configSnapshot: data.configSnapshot,
        startTime: new Date(Date.now() + 3600 * 1000),
      },
    });
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    if (createdTournamentIds.length > 0) {
      await prisma.tournament.deleteMany({
        where: { id: { in: createdTournamentIds } },
      }).catch(() => undefined);
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
    }
  });

  // =========================================================================
  // 1. 5-Tier Financial Model & 4-Position Prize Math
  // =========================================================================
  describe("1. 5-Tier Financial Model & 4-Position Math Verification", () => {
    it.each(CANONICAL_5_TIERS)(
      "validates prize distribution and exact 100% sum for tier: $name",
      ({ name, prizePool, expectedPrizes, maxPlayers, entryFee, expectedPlatformShare }) => {
        const validation = validatePrizeConfiguration(prizePool, DEFAULT_TIER_PRIZE_DISTRIBUTION);
        expect(validation.valid).toBe(true);
        expect(validation.totalPercentage).toBe(100);

        const calculated = calculatePrizes(prizePool, DEFAULT_TIER_PRIZE_DISTRIBUTION);
        expect(calculated).toHaveLength(4);

        const sumOfPrizes = calculated.reduce((sum, p) => sum + p.amount, 0);
        expect(sumOfPrizes).toBe(prizePool);

        // Verify individual 1st, 2nd, 3rd, 4th amounts
        for (const prize of calculated) {
          expect(prize.amount).toBe(expectedPrizes[prize.rank as 1 | 2 | 3 | 4]);
        }

        // Platform share calculation
        const totalCollection = entryFee * maxPlayers;
        const platformShare = totalCollection - prizePool;
        expect(platformShare).toBe(expectedPlatformShare);
      }
    );

    it("rejects configuration if percentage sum does not equal 100%", () => {
      const invalidDist = [
        { rank: 1, percentage: 50 },
        { rank: 2, percentage: 25 },
        { rank: 3, percentage: 15 },
        { rank: 4, percentage: 15 }, // sum is 105%
      ];
      const validation = validatePrizeConfiguration(10000, invalidDist);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("exceeds 100%");
    });
  });

  // =========================================================================
  // 2. Authoritative Prize Snapshotting
  // =========================================================================
  describe("2. Authoritative Prize Snapshotting", () => {
    it("freezes tier configuration into configSnapshot and insulates against future modifications", async () => {
      const tournament = await createTestTournament({
        title: "Standard Tournament Snapshot Test",
        gameId: "chess",
        prizePool: 10000,
        entryFee: 25,
        maxPlayers: 500,
      });

      const snapshot = await TournamentSettlementService.validateAndSnapshotPrizeConfig(tournament.id);
      expect(snapshot.prizePool).toBe(10000);
      expect(snapshot.entryFee).toBe(25);
      expect(snapshot.platformShare).toBe(2500);
      expect(snapshot.calculatedPrizes).toEqual([
        { rank: 1, percentage: 50, amount: 5000 },
        { rank: 2, percentage: 25, amount: 2500 },
        { rank: 3, percentage: 15, amount: 1500 },
        { rank: 4, percentage: 10, amount: 1000 },
      ]);

      // Later edit on tournament table
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { prizePool: 500 },
      });

      // Authoritative snapshot query must return frozen values
      const authoritative = await TournamentSettlementService.getAuthoritativePrizeSnapshot(tournament.id);
      expect(authoritative.prizePool).toBe(10000);
      expect(authoritative.calculatedPrizes[0].amount).toBe(5000);
    });
  });

  // =========================================================================
  // 3. Entry Fee Validation, Atomicity & Idempotency
  // =========================================================================
  describe("3. Entry Fee Deduction, Balance Check & Registration", () => {
    it("successfully registers player with sufficient balance and debits coins via ledger", async () => {
      const user = await createTestUser("Alice", 100);
      const tournament = await createTestTournament({
        title: "Standard Registration Test",
        gameId: "ludo",
        prizePool: 10000,
        entryFee: 25,
        maxPlayers: 500,
      });

      const regResult = await registerForTournament(user.id, tournament.id);
      expect(regResult.ok).toBe(true);
      expect(regResult.status).toBe("REGISTERED");
      expect(regResult.entryFee).toBe(25);
      expect(regResult.prizePool).toBe(10000);

      // Verify wallet balance decremented
      const updatedWallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      expect(updatedWallet?.balance).toBe(75);

      // Verify transaction ledger record
      const txRecord = await prisma.transaction.findFirst({
        where: {
          userId: user.id,
          referenceId: tournament.id,
          referenceType: "TOURNAMENT_ENTRY",
          type: "DEBIT",
        },
      });
      expect(txRecord).not.toBeNull();
      expect(txRecord?.amount).toBe(25);
      expect((txRecord?.meta as any)?.currency).toBe("COINS");
      expect((txRecord?.meta as any)?.status).toBe("COMPLETED");
    });

    it("rejects registration when user has insufficient balance and returns breakdown", async () => {
      const user = await createTestUser("Bob", 15); // Needs 25
      const tournament = await createTestTournament({
        title: "Standard Insufficient Balance Test",
        gameId: "table_tennis",
        prizePool: 10000,
        entryFee: 25,
        maxPlayers: 500,
      });

      const regInfo = await getRegistrationInfo(tournament.id, user.id);
      expect(regInfo.canRegister).toBe(false);
      expect(regInfo.ineligibilityReason).toBe("Insufficient balance");
      expect(regInfo.insufficientBalanceDetails).toEqual({
        required: 25,
        available: 15,
        shortage: 10,
      });

      await expect(registerForTournament(user.id, tournament.id)).rejects.toThrow(
        /insufficient balance/i
      );

      // Wallet remains intact
      const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      expect(wallet?.balance).toBe(15);
    });

    it("enforces idempotency on duplicate entry registration (never charge twice)", async () => {
      const user = await createTestUser("Charlie", 100);
      const tournament = await createTestTournament({
        title: "Standard Idempotency Test",
        gameId: "bubble_shooter",
        prizePool: 10000,
        entryFee: 25,
        maxPlayers: 500,
      });

      const firstCall = await registerForTournament(user.id, tournament.id);
      expect(firstCall.ok).toBe(true);

      // Second registration call
      await expect(registerForTournament(user.id, tournament.id)).rejects.toThrow(
        /already registered/i
      );

      // Verify wallet was only charged once (100 - 25 = 75)
      const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      expect(wallet?.balance).toBe(75);

      const debitCount = await prisma.transaction.count({
        where: {
          userId: user.id,
          referenceId: tournament.id,
          referenceType: "TOURNAMENT_ENTRY",
          type: "DEBIT",
        },
      });
      expect(debitCount).toBe(1);
    });
  });

  // =========================================================================
  // 4. Cancellation & Idempotent Refunds
  // =========================================================================
  describe("4. Cancellation & Idempotent Refunds", () => {
    it("refunds entry fee accurately referencing original debit transaction", async () => {
      const user = await createTestUser("David", 100);
      const tournament = await createTestTournament({
        title: "Standard Refund Test",
        gameId: "snooker",
        prizePool: 10000,
        entryFee: 25,
        maxPlayers: 500,
      });

      await registerForTournament(user.id, tournament.id);
      const debitTx = await prisma.transaction.findFirst({
        where: { userId: user.id, referenceId: tournament.id, type: "DEBIT" },
      });
      expect(debitTx).not.toBeNull();

      // Cancel registration
      const cancelRes = await cancelRegistration(user.id, tournament.id);
      expect(cancelRes.ok).toBe(true);

      // Verify balance restored to 100
      const restoredWallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      expect(restoredWallet?.balance).toBe(100);

      // Verify refund transaction in ledger
      const refundTx = await prisma.transaction.findFirst({
        where: {
          userId: user.id,
          referenceId: tournament.id,
          type: "CREDIT",
        },
      });
      expect(refundTx).not.toBeNull();
      expect(refundTx?.amount).toBe(25);
      expect((refundTx?.meta as any)?.originalTransactionId).toBe(debitTx?.id);
      expect((refundTx?.meta as any)?.status).toBe("REFUNDED");

      // Idempotent refund guard: RefundService won't credit twice
      const secondRefund = await RefundService.refundTournamentEntry({
        tournamentId: tournament.id,
        userId: user.id,
      });
      expect(secondRefund.status).toBe("ALREADY_REFUNDED");

      const finalWallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      expect(finalWallet?.balance).toBe(100);
    });
  });

  // =========================================================================
  // 5. Prize Settlement Across 4 Positions & Partial Settlement Recovery
  // =========================================================================
  describe("5. Prize Settlement Across 4 Positions & Recovery", () => {
    it("settles all 4 positions (50%, 25%, 15%, 10%) exactly once into winner wallets", async () => {
      const p1 = await createTestUser("Player 1", 0);
      const p2 = await createTestUser("Player 2", 0);
      const p3 = await createTestUser("Player 3", 0);
      const p4 = await createTestUser("Player 4", 0);

      const tournament = await createTestTournament({
        title: "Standard 4-Position Prize Settlement",
        gameId: "chess",
        prizePool: 10000,
        entryFee: 25,
        maxPlayers: 500,
        status: "COMPLETED",
      });

      // Snapshot config
      await TournamentSettlementService.validateAndSnapshotPrizeConfig(tournament.id);

      // Add ranked players
      await prisma.tournamentPlayer.createMany({
        data: [
          { tournamentId: tournament.id, userId: p1.id, finalRank: 1 },
          { tournamentId: tournament.id, userId: p2.id, finalRank: 2 },
          { tournamentId: tournament.id, userId: p3.id, finalRank: 3 },
          { tournamentId: tournament.id, userId: p4.id, finalRank: 4 },
        ],
      });

      const settlementRes = await TournamentSettlementService.settleTournamentPrizes(tournament.id, { force: true });
      expect(settlementRes.ok).toBe(true);
      expect(settlementRes.completedCount).toBe(4);
      expect(settlementRes.failedCount).toBe(0);

      // Verify wallet balances match exact 50%, 25%, 15%, 10%
      const [w1, w2, w3, w4] = await Promise.all([
        prisma.wallet.findUnique({ where: { userId: p1.id } }),
        prisma.wallet.findUnique({ where: { userId: p2.id } }),
        prisma.wallet.findUnique({ where: { userId: p3.id } }),
        prisma.wallet.findUnique({ where: { userId: p4.id } }),
      ]);
      expect(w1?.balance).toBe(5000); // 1st: 50%
      expect(w2?.balance).toBe(2500); // 2nd: 25%
      expect(w3?.balance).toBe(1500); // 3rd: 15%
      expect(w4?.balance).toBe(1000); // 4th: 10%
      expect((w1?.balance ?? 0) + (w2?.balance ?? 0) + (w3?.balance ?? 0) + (w4?.balance ?? 0)).toBe(10000);

      // Check tournament status is SETTLED
      const updatedTourn = await prisma.tournament.findUnique({ where: { id: tournament.id } });
      expect(updatedTourn?.status).toBe("SETTLED");
      expect(updatedTourn?.settledAt).not.toBeNull();

      // List settlements summary
      const summary = await TournamentSettlementService.listTournamentSettlements(tournament.id);
      expect(summary.overallSettlementStatus).toBe("SETTLED");
      expect(summary.totalPaidAmount).toBe(10000);
      expect(summary.completedCount).toBe(4);
      expect(summary.failedCount).toBe(0);

      // Second settlement execution must skip already completed prizes without duplicate credit
      const repeatRes = await TournamentSettlementService.settleTournamentPrizes(tournament.id, { force: true });
      expect(repeatRes.completedCount).toBe(4);

      const [w1After] = await Promise.all([
        prisma.wallet.findUnique({ where: { userId: p1.id } }),
      ]);
      expect(w1After?.balance).toBe(5000); // balance never doubled
    });

    it("handles partial settlement and allows admin retry without re-crediting successful prizes", async () => {
      const p1 = await createTestUser("P1", 0);
      const p2 = await createTestUser("P2", 0);
      const p3 = await createTestUser("P3", 0);
      const p4 = await createTestUser("P4", 0);

      const tournament = await createTestTournament({
        title: "Standard Partial Settlement Test",
        gameId: "fruit_ninja",
        prizePool: 10000,
        entryFee: 25,
        maxPlayers: 500,
        status: "COMPLETED",
      });

      await TournamentSettlementService.validateAndSnapshotPrizeConfig(tournament.id);

      await prisma.tournamentPlayer.createMany({
        data: [
          { tournamentId: tournament.id, userId: p1.id, finalRank: 1 },
          { tournamentId: tournament.id, userId: p2.id, finalRank: 2 },
          { tournamentId: tournament.id, userId: p3.id, finalRank: 3 },
          { tournamentId: tournament.id, userId: p4.id, finalRank: 4 },
        ],
      });

      // Simulate a transient database error specifically when crediting 3rd place (p3)
      const originalCreateTournamentPrize = WalletTransactionService.createTournamentPrize.bind(WalletTransactionService);
      let failedRank3Once = false;

      vi.spyOn(WalletTransactionService, "createTournamentPrize").mockImplementation(async (tx, params) => {
        if (params.rank === 3 && !failedRank3Once) {
          failedRank3Once = true;
          throw new Error("Simulated transient connection timeout during 3rd place prize credit");
        }
        return originalCreateTournamentPrize(tx, params);
      });

      const initialSettlement = await TournamentSettlementService.settleTournamentPrizes(tournament.id, { force: true });
      expect(initialSettlement.completedCount).toBe(3); // 1st, 2nd, 4th succeeded
      expect(initialSettlement.failedCount).toBe(1); // 3rd failed

      // Inspect partial settlement status
      const partialSummary = await TournamentSettlementService.listTournamentSettlements(tournament.id);
      expect(partialSummary.overallSettlementStatus).toBe("PARTIALLY_SETTLED");
      expect(partialSummary.completedCount).toBe(3);
      expect(partialSummary.failedCount).toBe(1);

      // Verify p1, p2, p4 got credited, while p3 was not
      const [w1, w2, w3, w4] = await Promise.all([
        prisma.wallet.findUnique({ where: { userId: p1.id } }),
        prisma.wallet.findUnique({ where: { userId: p2.id } }),
        prisma.wallet.findUnique({ where: { userId: p3.id } }),
        prisma.wallet.findUnique({ where: { userId: p4.id } }),
      ]);
      expect(w1?.balance).toBe(5000);
      expect(w2?.balance).toBe(2500);
      expect(w3?.balance).toBe(0); // Failed
      expect(w4?.balance).toBe(1000);

      // Admin executes retry of failed settlement
      const retryResult = await TournamentSettlementService.retryFailedSettlements(
        tournament.id,
        "admin-1",
        "Admin resolving transient network failure",
      );
      expect(retryResult.ok).toBe(true);

      // Verify p3 now received prize without duplicating p1, p2, or p4
      const [w1Final, w2Final, w3Final, w4Final] = await Promise.all([
        prisma.wallet.findUnique({ where: { userId: p1.id } }),
        prisma.wallet.findUnique({ where: { userId: p2.id } }),
        prisma.wallet.findUnique({ where: { userId: p3.id } }),
        prisma.wallet.findUnique({ where: { userId: p4.id } }),
      ]);
      expect(w1Final?.balance).toBe(5000);
      expect(w2Final?.balance).toBe(2500);
      expect(w3Final?.balance).toBe(1500); // Now credited
      expect(w4Final?.balance).toBe(1000);

      // Final summary
      const finalSummary = await TournamentSettlementService.listTournamentSettlements(tournament.id);
      expect(finalSummary.overallSettlementStatus).toBe("SETTLED");
      expect(finalSummary.completedCount).toBe(4);
      expect(finalSummary.failedCount).toBe(0);
    });
  });

  // =========================================================================
  // 6. Shared Financial Architecture across all 9 available games
  // =========================================================================
  describe("6. Shared Financial Processing across all 9 Competitive Games", () => {
    it.each(ALL_9_GAMES)(
      "correctly operates entry and settlement financial lifecycle for game: %s",
      async (gameId) => {
        const p1 = await createTestUser(`Winner_${gameId}`, 50);
        const tournament = await createTestTournament({
          title: `${gameId} Mini Championship`,
          gameId,
          prizePool: 400,
          entryFee: 5,
          maxPlayers: 100,
        });

        // 1. Entry registration
        const reg = await registerForTournament(p1.id, tournament.id);
        expect(reg.ok).toBe(true);

        const wAfterReg = await prisma.wallet.findUnique({ where: { userId: p1.id } });
        expect(wAfterReg?.balance).toBe(45); // 50 - 5

        // 2. Snapshot
        await TournamentSettlementService.validateAndSnapshotPrizeConfig(tournament.id);

        // 3. Complete tournament and settle 1st place
        await prisma.tournamentPlayer.update({
          where: { tournamentId_userId: { tournamentId: tournament.id, userId: p1.id } },
          data: { finalRank: 1 },
        });

        await prisma.tournament.update({
          where: { id: tournament.id },
          data: { status: "COMPLETED" },
        });

        const settleRes = await TournamentSettlementService.settleTournamentPrizes(tournament.id, { force: true });
        expect(settleRes.ok).toBe(true);

        // Winner gets 50% of 400 = 200 -> 45 + 200 = 245
        const wAfterPrize = await prisma.wallet.findUnique({ where: { userId: p1.id } });
        expect(wAfterPrize?.balance).toBe(245);
      }
    );
  });
});
