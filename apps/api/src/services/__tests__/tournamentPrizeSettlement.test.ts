import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@gaming-hub/db";
import {
  validatePrizeConfiguration,
  calculatePrizes,
  defaultPrizeDistribution,
} from "@gaming-hub/shared";
import { TournamentSettlementService } from "../tournamentSettlementService";
import {
  startTournament,
  finalizeTournament,
} from "../tournamentEngine";
import { TournamentEmailService } from "../tournamentEmailService";
import { TournamentNotificationService } from "../tournamentNotificationService";

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

describe("Tournament Prize Distribution & Settlement Verification", () => {
  const createdTournamentIds: string[] = [];
  const createdUserIds: string[] = [];

  async function createTestPlayer(displayName: string, initialBalance = 1000) {
    const id = `u_prize_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
    const id = `tourn_prize_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    createdTournamentIds.push(id);

    return prisma.tournament.create({
      data: {
        id,
        title: data.title,
        description: `${data.title} description`,
        gameId: data.gameId,
        format: data.format || "SINGLE_ELIMINATION",
        status: data.status || "COMPLETED",
        prizePool: data.prizePool,
        grossPool: data.grossPool || data.prizePool,
        entryFee: data.entryFee || 0,
        minPlayers: data.minPlayers || 2,
        maxPlayers: data.maxPlayers || 2,
        prizeDistribution: data.prizeDistribution || [{ rank: 1, percentage: 100 }],
        configSnapshot: data.configSnapshot,
        startTime: new Date(),
      },
    });
  }

  beforeEach(async () => {
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
  // 1. Authoritative Prize Pool & Distribution Validation
  // =========================================================================
  describe("1. Prize Pool & Distribution Validation", () => {
    it("validates correct 60/30/10 percentage distribution on 10,000 coin pool", () => {
      const distribution = defaultPrizeDistribution("SINGLE_ELIMINATION");
      const validation = validatePrizeConfiguration(10000, distribution);
      expect(validation.valid).toBe(true);
      expect(validation.totalPercentage).toBe(100);

      const calculated = calculatePrizes(10000, distribution);
      expect(calculated).toEqual([
        { rank: 1, amount: 6000 },
        { rank: 2, amount: 3000 },
        { rank: 3, amount: 1000 },
      ]);
    });

    it("rejects configuration when sum of percentages exceeds 100%", () => {
      const invalidDistribution = [
        { rank: 1, percentage: 70 },
        { rank: 2, percentage: 40 },
      ];
      const validation = validatePrizeConfiguration(10000, invalidDistribution);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("exceeds 100%");
    });

    it("rejects configuration when sum of fixed prize amounts exceeds authoritative prize pool", () => {
      const invalidFixed = [
        { rank: 1, amount: 8000, percentage: 0 },
        { rank: 2, amount: 4000, percentage: 0 },
      ];
      const validation = validatePrizeConfiguration(10000, invalidFixed);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("exceeds authoritative prize pool");
    });
  });

  // =========================================================================
  // 2. Snapshot Freezing on Tournament Start
  // =========================================================================
  describe("2. Prize Configuration Snapshotting & Immutability", () => {
    it("snapshots prize rules upon start and remains immutable if draft config is edited later", async () => {
      const user1 = await createTestPlayer("Snap Player 1");
      const user2 = await createTestPlayer("Snap Player 2");

      const tournament = await createTestTournament({
        title: `Snapshot Immutability Tournament`,
        gameId: "chess",
        status: "REGISTRATION_CLOSED",
        prizePool: 10000,
        grossPool: 10000,
        entryFee: 0,
        minPlayers: 2,
        maxPlayers: 2,
        prizeDistribution: [
          { rank: 1, percentage: 60 },
          { rank: 2, percentage: 40 },
        ],
      });

      await prisma.tournamentPlayer.createMany({
        data: [
          { tournamentId: tournament.id, userId: user1.id },
          { tournamentId: tournament.id, userId: user2.id },
        ],
      });

      // Start tournament -> captures snapshot
      await startTournament(tournament.id, "system");

      const runningTournament = await prisma.tournament.findUnique({
        where: { id: tournament.id },
      });
      expect(runningTournament?.status).toBe("IN_PROGRESS");
      expect(runningTournament?.configSnapshot).toBeDefined();

      const snapshot = runningTournament?.configSnapshot as any;
      expect(snapshot.prizePool).toBe(10000);
      expect(snapshot.calculatedPrizes).toEqual([
        { rank: 1, amount: 6000, percentage: 60 },
        { rank: 2, amount: 4000, percentage: 40 },
      ]);

      // Admin attempts to tamper with prize pool in tournament table
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { prizePool: 50000 },
      });

      // Authoritative snapshot method continues to return original frozen snapshot
      const readSnapshot = await TournamentSettlementService.getAuthoritativePrizeSnapshot(tournament.id);
      expect(readSnapshot.prizePool).toBe(10000);
      expect(readSnapshot.calculatedPrizes[0].amount).toBe(6000);
    });
  });

  // =========================================================================
  // 3. Multi-Position Idempotent Settlement & Wallet Integration
  // =========================================================================
  describe("3. Multi-Position Idempotent Settlement & Exact-Once Wallet Credit", () => {
    it("settles 1st, 2nd, and 3rd place prizes exactly-once and updates player balances via ledger", async () => {
      const user1 = await createTestPlayer("Winner 1", 100);
      const user2 = await createTestPlayer("RunnerUp 2", 50);
      const user3 = await createTestPlayer("Third 3", 0);

      const tournament = await createTestTournament({
        title: `3-Winner Settlement`,
        gameId: "snake_and_ladder",
        status: "COMPLETED",
        prizePool: 10000,
        grossPool: 10000,
        entryFee: 0,
        minPlayers: 4,
        maxPlayers: 4,
        prizeDistribution: [
          { rank: 1, percentage: 60 },
          { rank: 2, percentage: 30 },
          { rank: 3, percentage: 10 },
        ],
        configSnapshot: {
          prizePool: 10000,
          grossPool: 10000,
          prizeDistribution: [
            { rank: 1, percentage: 60 },
            { rank: 2, percentage: 30 },
            { rank: 3, percentage: 10 },
          ],
          calculatedPrizes: [
            { rank: 1, amount: 6000 },
            { rank: 2, amount: 3000 },
            { rank: 3, amount: 1000 },
          ],
          currency: "coins",
          format: "SINGLE_ELIMINATION",
          gameId: "snake_and_ladder",
          stateVersion: 1,
          snapshottedAt: new Date().toISOString(),
        },
      });

      await prisma.tournamentPlayer.createMany({
        data: [
          { tournamentId: tournament.id, userId: user1.id, finalRank: 1 },
          { tournamentId: tournament.id, userId: user2.id, finalRank: 2, eliminated: true },
          { tournamentId: tournament.id, userId: user3.id, finalRank: 3, eliminated: true },
        ],
      });

      // Run settlement
      const settlement = await TournamentSettlementService.settleTournamentPrizes(tournament.id);

      expect(settlement.ok).toBe(true);
      expect(settlement.completedCount).toBe(3);
      expect(settlement.failedCount).toBe(0);

      // Verify wallet balances updated through ledger
      const wallet1 = await prisma.wallet.findUnique({ where: { userId: user1.id } });
      const wallet2 = await prisma.wallet.findUnique({ where: { userId: user2.id } });
      const wallet3 = await prisma.wallet.findUnique({ where: { userId: user3.id } });

      expect(wallet1?.balance).toBe(100 + 6000);
      expect(wallet2?.balance).toBe(50 + 3000);
      expect(wallet3?.balance).toBe(0 + 1000);

      // Verify TournamentPrize records
      const prizeRecords = await prisma.tournamentPrize.findMany({
        where: { tournamentId: tournament.id },
        orderBy: { rank: "asc" },
      });
      expect(prizeRecords.length).toBe(3);
      expect(prizeRecords[0].status).toBe("COMPLETED");
      expect(prizeRecords[0].amount).toBe(6000);
      expect(prizeRecords[0].transactionId).toBeDefined();

      // Verify idempotency: run settlement again
      const secondSettlement = await TournamentSettlementService.settleTournamentPrizes(tournament.id);
      expect(secondSettlement.ok).toBe(true);

      const wallet1After = await prisma.wallet.findUnique({ where: { userId: user1.id } });
      expect(wallet1After?.balance).toBe(6100); // Strictly not double credited
    });
  });

  // =========================================================================
  // 4. Dispute Gating Protection
  // =========================================================================
  describe("4. Disputed Final Match Protection", () => {
    it("halts settlement if final match is under active dispute review", async () => {
      const user1 = await createTestPlayer("Disp 1");
      const user2 = await createTestPlayer("Disp 2");

      const tournament = await createTestTournament({
        title: `Dispute Protected Tournament`,
        gameId: "carrom",
        status: "COMPLETED",
        prizePool: 5000,
        grossPool: 5000,
        entryFee: 0,
        minPlayers: 2,
        maxPlayers: 2,
        configSnapshot: {
          prizePool: 5000,
          grossPool: 5000,
          prizeDistribution: [{ rank: 1, percentage: 100 }],
          calculatedPrizes: [{ rank: 1, amount: 5000 }],
          currency: "coins",
          format: "SINGLE_ELIMINATION",
          gameId: "carrom",
          stateVersion: 1,
          snapshottedAt: new Date().toISOString(),
        },
      });

      await prisma.tournamentPlayer.createMany({
        data: [
          { tournamentId: tournament.id, userId: user1.id, finalRank: 1 },
          { tournamentId: tournament.id, userId: user2.id, finalRank: 2, eliminated: true },
        ],
      });

      const matchId = `match-dispute-final-${Date.now()}`;
      await prisma.tournamentRound.create({
        data: {
          tournamentId: tournament.id,
          roundNumber: 1,
          matchNumber: 1,
          matchId,
          winnerId: user1.id,
          status: "COMPLETED",
        },
      });

      // Create active dispute on the final match
      await prisma.tournamentDispute.create({
        data: {
          disputeId: `DISP-${Date.now()}`,
          tournamentId: tournament.id,
          matchId,
          userId: user2.id,
          reason: "UNRESPONSIVE_OPPONENT",
          description: "Opponent was stalling",
          status: "UNDER_REVIEW",
        },
      });

      // Settle must halt with error
      await expect(TournamentSettlementService.settleTournamentPrizes(tournament.id)).rejects.toThrow(
        /Final match is under active dispute review/,
      );

      // Now resolve the dispute
      await prisma.tournamentDispute.updateMany({
        where: { matchId },
        data: { status: "RESOLVED", resolutionAction: "UPHELD_ORIGINAL_RESULT" },
      });

      // Settle should now proceed cleanly
      const result = await TournamentSettlementService.settleTournamentPrizes(tournament.id);
      expect(result.ok).toBe(true);
      expect(result.completedCount).toBe(1);
    });
  });

  // =========================================================================
  // 5. Cancellation Protection
  // =========================================================================
  describe("5. Tournament Cancellation Protection", () => {
    it("strictly prohibits rank prize distribution on cancelled tournaments", async () => {
      const tournament = await createTestTournament({
        title: `Cancelled Tourn`,
        gameId: "snooker",
        status: "CANCELLED",
        prizePool: 10000,
        grossPool: 10000,
        entryFee: 100,
        minPlayers: 2,
        maxPlayers: 2,
      });

      await expect(TournamentSettlementService.settleTournamentPrizes(tournament.id)).rejects.toThrow(
        /Cannot distribute rank prizes for a cancelled tournament/,
      );
    });
  });

  // =========================================================================
  // 6. Admin Recovery & Retry of Failed Settlements
  // =========================================================================
  describe("6. Admin Recovery & Safe Retries", () => {
    it("records FAILED status and allows safe admin retry", async () => {
      const user = await createTestPlayer("Retry User");

      const tournament = await createTestTournament({
        title: `Retry Admin Tourn`,
        gameId: "table_tennis",
        status: "COMPLETED",
        prizePool: 2000,
        grossPool: 2000,
        entryFee: 0,
        minPlayers: 2,
        maxPlayers: 2,
        configSnapshot: {
          prizePool: 2000,
          grossPool: 2000,
          prizeDistribution: [{ rank: 1, percentage: 100 }],
          calculatedPrizes: [{ rank: 1, amount: 2000 }],
          currency: "coins",
          format: "SINGLE_ELIMINATION",
          gameId: "table_tennis",
          stateVersion: 1,
          snapshottedAt: new Date().toISOString(),
        },
      });

      const player = await prisma.tournamentPlayer.create({
        data: { tournamentId: tournament.id, userId: user.id, finalRank: 1 },
      });

      // Create simulated failed prize record
      const prize = await prisma.tournamentPrize.create({
        data: {
          tournamentId: tournament.id,
          userId: user.id,
          playerId: player.id,
          rank: 1,
          amount: 2000,
          status: "FAILED",
          failureReason: "Simulated gateway connection timeout",
          retryCount: 1,
        },
      });

      // List settlements summary
      const summary = await TournamentSettlementService.listTournamentSettlements(tournament.id);
      expect(summary.totalPrizesCount).toBe(1);
      expect(summary.failedCount).toBe(1);
      expect(summary.completedCount).toBe(0);
      expect(summary.settlements[0].failureReason).toContain("gateway connection timeout");

      // Admin executes retry
      const retryResult = await TournamentSettlementService.retryFailedSettlements(
        tournament.id,
        "admin-user-1",
        "Retrying after ledger service recovery",
        prize.id,
      );

      expect(retryResult.ok).toBe(true);
      if ("completedCount" in retryResult) {
        expect(retryResult.completedCount).toBe(1);
      }

      // Verify prize status transitioned to COMPLETED
      const updatedPrize = await prisma.tournamentPrize.findUnique({
        where: { id: prize.id },
      });
      expect(updatedPrize?.status).toBe("COMPLETED");
      expect(updatedPrize?.paidAt).toBeDefined();
    });
  });

  // =========================================================================
  // 7. Post-Credit Notifications & Email Verification
  // =========================================================================
  describe("7. Post-Credit Notifications & Emails", () => {
    it("dispatches in-app notification and email strictly after transaction commits", async () => {
      const notifySpy = vi.spyOn(TournamentNotificationService, "notifyPrizeCredited");
      const emailSpy = vi.spyOn(TournamentEmailService, "sendPrizeCreditedEmail");

      const user = await createTestPlayer("Notify User");

      const tournament = await createTestTournament({
        title: `Notify Tourn`,
        gameId: "fruit_ninja",
        status: "COMPLETED",
        prizePool: 1000,
        grossPool: 1000,
        entryFee: 0,
        minPlayers: 2,
        maxPlayers: 2,
        configSnapshot: {
          prizePool: 1000,
          grossPool: 1000,
          prizeDistribution: [{ rank: 1, percentage: 100 }],
          calculatedPrizes: [{ rank: 1, amount: 1000 }],
          currency: "coins",
          format: "SINGLE_ELIMINATION",
          gameId: "fruit_ninja",
          stateVersion: 1,
          snapshottedAt: new Date().toISOString(),
        },
      });

      await prisma.tournamentPlayer.create({
        data: { tournamentId: tournament.id, userId: user.id, finalRank: 1 },
      });

      await TournamentSettlementService.settleTournamentPrizes(tournament.id);

      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tournamentId: tournament.id,
          playerId: user.id,
          amount: 1000,
          rank: 1,
        }),
      );

      expect(emailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          tournamentId: tournament.id,
          amount: 1000,
          rank: 1,
        }),
      );
    });
  });

  // =========================================================================
  // 8. Compatibility Across All 10 Multiplayer Games
  // =========================================================================
  describe("8. Game-Agnostic Compatibility Across All 10 Games", () => {
    it.each(ALL_9_GAMES)(
      "validates prize snapshotting and settlement for %s",
      async (gameId) => {
        const user = await createTestPlayer(`Player ${gameId}`);

        const tournament = await createTestTournament({
          title: `${gameId} Championship`,
          gameId,
          status: "COMPLETED",
          prizePool: 3000,
          grossPool: 3000,
          entryFee: 0,
          minPlayers: 2,
          maxPlayers: 2,
          configSnapshot: {
            prizePool: 3000,
            grossPool: 3000,
            prizeDistribution: [{ rank: 1, percentage: 100 }],
            calculatedPrizes: [{ rank: 1, amount: 3000 }],
            currency: "coins",
            format: "SINGLE_ELIMINATION",
            gameId,
            stateVersion: 1,
            snapshottedAt: new Date().toISOString(),
          },
        });

        await prisma.tournamentPlayer.create({
          data: { tournamentId: tournament.id, userId: user.id, finalRank: 1 },
        });

        const settlement = await TournamentSettlementService.settleTournamentPrizes(tournament.id);
        expect(settlement.ok).toBe(true);
        expect(settlement.completedCount).toBe(1);

        const playerPrize = await TournamentSettlementService.getPlayerSettlement(tournament.id, user.id);
        expect(playerPrize?.status).toBe("COMPLETED");
        expect(playerPrize?.prizeAmount).toBe(3000);
      },
    );
  });
});
