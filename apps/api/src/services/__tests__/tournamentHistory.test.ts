import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { TournamentHistoryService } from "../tournamentHistoryService";
import { WalletTransactionService } from "../walletTransactionService";

describe("Feature 15: Complete User Tournament History", () => {
  const createdUserIds: string[] = [];
  const createdTournamentIds: string[] = [];

  async function createTestUser(prefix: string, balance = 1000) {
    const userId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        username: `u_${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`,
        displayName: `User ${userId.slice(0, 8)}`,
        email: `${userId}@test.com`,
        wallet: {
          create: {
            balance,
          },
        },
        profile: {
          create: {},
        },
      },
    });

    return userId;
  }

  async function createTestTournament(params: {
    title: string;
    gameId: string;
    entryFee: number;
    status: any;
    startTime?: Date;
  }) {
    const tournamentId = `tourn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    createdTournamentIds.push(tournamentId);

    const tournament = await prisma.tournament.create({
      data: {
        id: tournamentId,
        title: params.title,
        description: `Description for ${params.title}`,
        gameId: params.gameId,
        entryFee: params.entryFee,
        prizePool: params.entryFee * 8,
        status: params.status,
        startTime: params.startTime ?? new Date(),
      },
    });

    return tournament;
  }

  afterEach(async () => {
    if (createdTournamentIds.length > 0) {
      await prisma.tournament.deleteMany({
        where: { id: { in: createdTournamentIds } },
      }).catch(() => undefined);
      createdTournamentIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Registered Tournament
  // ---------------------------------------------------------------------------
  it("1. Registered tournament: displays REGISTERED result with entry fee and bracket link", async () => {
    const userA = await createTestUser("u-th-1-a", 1000);
    const tournament = await createTestTournament({
      title: "Chess Spring Open",
      gameId: "chess",
      entryFee: 100,
      status: "REGISTRATION_OPEN",
    });

    await prisma.tournamentPlayer.create({
      data: {
        tournamentId: tournament.id,
        userId: userA,
      },
    });

    await WalletTransactionService.createDebit(prisma, {
      userId: userA,
      amount: 100,
      referenceType: "TOURNAMENT_ENTRY",
      referenceId: tournament.id,
    });

    const history = await TournamentHistoryService.listUserTournamentHistory({ userId: userA });
    expect(history.total).toBe(1);
    expect(history.items).toHaveLength(1);

    const item = history.items[0];
    expect(item.tournamentId).toBe(tournament.id);
    expect(item.name).toBe("Chess Spring Open");
    expect(item.entryFee).toBe(100);
    expect(item.result).toBe("REGISTERED");
    expect(item.bracketUrl).toBe(`/api/tournaments/${tournament.id}/bracket`);
    expect(item.transactionIds).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 2. Completed Tournament: Winner & Runner-up
  // ---------------------------------------------------------------------------
  it("2. Completed tournament: identifies WINNER and RUNNER_UP with authoritative rank and prize", async () => {
    const userA = await createTestUser("u-th-2-a", 1000);
    const userB = await createTestUser("u-th-2-b", 1000);
    const tournament = await createTestTournament({
      title: "Carrom Pro Cup",
      gameId: "carrom",
      entryFee: 200,
      status: "COMPLETED",
    });

    const playerA = await prisma.tournamentPlayer.create({
      data: { tournamentId: tournament.id, userId: userA, finalRank: 1 },
    });
    const playerB = await prisma.tournamentPlayer.create({
      data: { tournamentId: tournament.id, userId: userB, finalRank: 2 },
    });

    // Payouts
    await prisma.tournamentPrize.create({
      data: { tournamentId: tournament.id, userId: userA, playerId: playerA.id, rank: 1, amount: 1000 },
    });
    await prisma.tournamentPrize.create({
      data: { tournamentId: tournament.id, userId: userB, playerId: playerB.id, rank: 2, amount: 400 },
    });

    const historyA = await TournamentHistoryService.listUserTournamentHistory({ userId: userA });
    expect(historyA.items[0].result).toBe("WINNER");
    expect(historyA.items[0].finalRank).toBe(1);
    expect(historyA.items[0].rankDisplay).toBe("1st Place");
    expect(historyA.items[0].prize).toBe(1000);

    const historyB = await TournamentHistoryService.listUserTournamentHistory({ userId: userB });
    expect(historyB.items[0].result).toBe("RUNNER_UP");
    expect(historyB.items[0].finalRank).toBe(2);
    expect(historyB.items[0].rankDisplay).toBe("2nd Place");
    expect(historyB.items[0].prize).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // 3. Eliminated Player
  // ---------------------------------------------------------------------------
  it("3. Eliminated player: displays ELIMINATED result with elimination round", async () => {
    const userA = await createTestUser("u-th-3-a", 1000);
    const tournament = await createTestTournament({
      title: "Ludo Masters",
      gameId: "ludo",
      entryFee: 50,
      status: "COMPLETED",
    });

    await prisma.tournamentPlayer.create({
      data: {
        tournamentId: tournament.id,
        userId: userA,
        eliminated: true,
        eliminatedInRound: 2,
      },
    });

    const history = await TournamentHistoryService.listUserTournamentHistory({ userId: userA });
    expect(history.items[0].result).toBe("ELIMINATED");
    expect(history.items[0].eliminated).toBe(true);
    expect(history.items[0].eliminatedInRound).toBe(2);
    expect(history.items[0].rankDisplay).toBe("Eliminated Round 2");
    expect(history.items[0].prize).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 4. Cancelled & Refunded Tournament
  // ---------------------------------------------------------------------------
  it("4. Cancelled tournament: shows CANCELLED status with 100% refund amount", async () => {
    const userA = await createTestUser("u-th-4-a", 1000);
    const tournament = await createTestTournament({
      title: "Table Tennis Blitz",
      gameId: "table-tennis",
      entryFee: 100,
      status: "CANCELLED",
    });

    await prisma.tournamentPlayer.create({
      data: { tournamentId: tournament.id, userId: userA },
    });

    await WalletTransactionService.createCredit(prisma, {
      userId: userA,
      amount: 100,
      referenceType: "WAGER_REFUND",
      referenceId: tournament.id,
      meta: { reason: "tournament_cancelled" },
    });

    const history = await TournamentHistoryService.listUserTournamentHistory({ userId: userA });
    expect(history.items[0].result).toBe("CANCELLED");
    expect(history.items[0].status).toBe("CANCELLED");
    expect(history.items[0].refund).toBe(100);
    expect(history.items[0].transactionIds).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 5. Match History & Details
  // ---------------------------------------------------------------------------
  it("5. Match history within tournament: returns round-by-round match breakdown", async () => {
    const userA = await createTestUser("u-th-5-a", 1000);
    const userB = await createTestUser("u-th-5-b", 1000);
    const tournament = await createTestTournament({
      title: "Cricket Premier Cup",
      gameId: "cricket",
      entryFee: 100,
      status: "COMPLETED",
    });

    const playerA = await prisma.tournamentPlayer.create({
      data: { tournamentId: tournament.id, userId: userA, finalRank: 1 },
    });
    const playerB = await prisma.tournamentPlayer.create({
      data: { tournamentId: tournament.id, userId: userB, finalRank: 2 },
    });

    await prisma.tournamentRound.create({
      data: {
        tournamentId: tournament.id,
        roundNumber: 1,
        matchNumber: 1,
        status: "COMPLETED",
        playerAId: playerA.id,
        playerBId: playerB.id,
        winnerId: playerA.id,
        playerAScore: 45,
        playerBScore: 32,
      },
    });

    const details = await TournamentHistoryService.getTournamentHistoryDetails(userA, tournament.id);
    expect(details.name).toBe("Cricket Premier Cup");
    expect(details.matches).toHaveLength(1);
    expect(details.matches[0].roundNumber).toBe(1);
    expect(details.matches[0].isWinner).toBe(true);
    expect(details.matches[0].myScore).toBe(45);
    expect(details.matches[0].opponentScore).toBe(32);
  });

  // ---------------------------------------------------------------------------
  // 6. Unauthorized Access
  // ---------------------------------------------------------------------------
  it("6. Unauthorized access: unregistered user querying tournament history details gets 403", async () => {
    const userA = await createTestUser("u-th-6-a", 1000);
    const userB = await createTestUser("u-th-6-b", 1000);
    const tournament = await createTestTournament({
      title: "Restricted Cup",
      gameId: "chess",
      entryFee: 100,
      status: "COMPLETED",
    });

    await prisma.tournamentPlayer.create({
      data: { tournamentId: tournament.id, userId: userA },
    });

    // userB not in tournament
    await expect(
      TournamentHistoryService.getTournamentHistoryDetails(userB, tournament.id)
    ).rejects.toThrow(/FORBIDDEN|not registered/i);
  });

  // ---------------------------------------------------------------------------
  // 7. Empty State Handling
  // ---------------------------------------------------------------------------
  it("7. Empty state: user with 0 tournaments returns empty list cleanly", async () => {
    const userA = await createTestUser("u-th-7-a", 1000);

    const history = await TournamentHistoryService.listUserTournamentHistory({ userId: userA });
    expect(history.items).toEqual([]);
    expect(history.total).toBe(0);
    expect(history.totalPages).toBe(0);
  });
});
