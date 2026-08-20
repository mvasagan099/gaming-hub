import { describe, expect, it, beforeEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { applyTransaction, getWallet } from "../wallet";
import { GameCoinService } from "../gameCoinService";
import { registerForTournament, cancelRegistration } from "../tournaments";
import { cancelTournamentWithRefunds, settleTournament } from "../tournamentEngine";

describe("Financial Economy & Settlement Full Audit Test Suite", () => {
  const userA = "test-fin-user-a";
  const userB = "test-fin-user-b";
  const userC = "test-fin-user-c";

  beforeEach(async () => {
    // Seed test users, profiles & wallets
    for (const u of [userA, userB, userC]) {
      await prisma.user.upsert({
        where: { id: u },
        create: {
          id: u,
          email: `${u}@test.local`,
          username: u,
          displayName: `User ${u}`,
        },
        update: {},
      });

      await prisma.profile.upsert({
        where: { userId: u },
        create: {
          userId: u,
          coins: 1000,
        },
        update: {
          coins: 1000,
        },
      });

      await prisma.wallet.upsert({
        where: { userId: u },
        create: {
          userId: u,
          balance: 1000,
        },
        update: {
          balance: 1000,
          isFrozen: false,
        },
      });
    }

    // Clean up test transactions, matches, and tournaments
    const testMatchIds = [
      "match-idempotent-test",
      "match-settle-payout-test",
      "match-repeat-settle-test",
      "match-draw-refund-test",
      "match-cancel-refund-test",
    ];
    await prisma.match.deleteMany({
      where: { id: { in: testMatchIds } },
    });

    await prisma.transaction.deleteMany({
      where: { userId: { in: [userA, userB, userC] } },
    });
  });

  // =========================================================================
  // SCENARIO A: Standard Entry Fee Deduction
  // =========================================================================
  it("Scenario A: Deducts entry fee atomically and records immutable transaction", async () => {
    const initialWallet = await getWallet(userA);
    expect(initialWallet.balance).toBe(1000);

    const updatedWallet = await prisma.$transaction(async (tx) => {
      return applyTransaction(tx, userA, -100, "MATCH_WAGER", "match-scenario-a", {
        gameId: "carrom",
        entryFee: 100,
      });
    });

    expect(updatedWallet.balance).toBe(900);

    const txs = await prisma.transaction.findMany({
      where: { userId: userA, referenceId: "match-scenario-a" },
    });
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("DEBIT");
    expect(txs[0].amount).toBe(100);
    expect(txs[0].balanceAfter).toBe(900);
    expect(txs[0].referenceType).toBe("MATCH_WAGER");
  });

  // =========================================================================
  // SCENARIO B: Insufficient Balance Rejection
  // =========================================================================
  it("Scenario B: Rejects entry when balance is insufficient (no coins deducted)", async () => {
    await prisma.wallet.update({
      where: { userId: userA },
      data: { balance: 50 },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        return applyTransaction(tx, userA, -100, "MATCH_WAGER", "match-scenario-b");
      }),
    ).rejects.toThrow("Insufficient balance");

    const finalWallet = await getWallet(userA);
    expect(finalWallet.balance).toBe(50);

    const txs = await prisma.transaction.findMany({
      where: { userId: userA, referenceId: "match-scenario-b" },
    });
    expect(txs).toHaveLength(0);
  });

  // =========================================================================
  // SCENARIO C: Exact Balance Entry (balance === entryFee)
  // =========================================================================
  it("Scenario C: Allows entry when balance exactly equals entry fee (resulting in 0)", async () => {
    await prisma.wallet.update({
      where: { userId: userA },
      data: { balance: 100 },
    });

    const updatedWallet = await prisma.$transaction(async (tx) => {
      return applyTransaction(tx, userA, -100, "MATCH_WAGER", "match-scenario-c");
    });

    expect(updatedWallet.balance).toBe(0);

    const finalWallet = await getWallet(userA);
    expect(finalWallet.balance).toBe(0);
  });

  // =========================================================================
  // SCENARIO D: Match Hold Entry Idempotency (reserveMatchEntry)
  // =========================================================================
  it("Scenario D: Match entry reservation is idempotent and does not double-deduct", async () => {
    const matchId = "match-idempotent-test";
    await prisma.match.create({
      data: {
        id: matchId,
        gameId: "table-tennis",
        status: "CREATED",
        stake: 100,
        players: {
          create: [
            { userId: userA, seat: 0 },
            { userId: userB, seat: 1 },
          ],
        },
      },
    });

    // First call: reserves wagers, moves status to ACTIVE
    const match1 = await GameCoinService.reserveMatchEntry(matchId);
    expect(match1.status).toBe("ACTIVE");

    const walletA1 = await getWallet(userA);
    const walletB1 = await getWallet(userB);
    expect(walletA1.balance).toBe(900);
    expect(walletB1.balance).toBe(900);

    // Second call: idempotent, already ACTIVE, no deduction
    const match2 = await GameCoinService.reserveMatchEntry(matchId);
    expect(match2.status).toBe("ACTIVE");

    const walletA2 = await getWallet(userA);
    const walletB2 = await getWallet(userB);
    expect(walletA2.balance).toBe(900);
    expect(walletB2.balance).toBe(900);

    // Cleanup match
    await prisma.match.delete({ where: { id: matchId } });
  });

  // =========================================================================
  // SCENARIO E: Concurrency & Race Condition Protection
  // =========================================================================
  it("Scenario E: Concurrent debit requests cannot overspend (only 1 succeeds when balance = 150)", async () => {
    await prisma.wallet.update({
      where: { userId: userA },
      data: { balance: 150 },
    });

    // Fire 2 simultaneous debits of 100
    const results = await Promise.allSettled([
      prisma.$transaction(async (tx) => {
        return applyTransaction(tx, userA, -100, "MATCH_WAGER", "concurrent-1");
      }),
      prisma.$transaction(async (tx) => {
        return applyTransaction(tx, userA, -100, "MATCH_WAGER", "concurrent-2");
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const finalWallet = await getWallet(userA);
    expect(finalWallet.balance).toBe(50);
  });

  // =========================================================================
  // SCENARIO F: Failed Match Rollback
  // =========================================================================
  it("Scenario F: Failed match start transaction rolls back all debits", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await applyTransaction(tx, userA, -100, "MATCH_WAGER", "match-failed-start");
        throw new Error("Simulated system failure during game initialization");
      }),
    ).rejects.toThrow("Simulated system failure");

    const finalWallet = await getWallet(userA);
    expect(finalWallet.balance).toBe(1000);
  });

  // =========================================================================
  // SCENARIO G: Match Settlement with 90% Prize Pool (House Rake = 10%)
  // =========================================================================
  it("Scenario G: Settles match correctly with 90% prize pool to winner", async () => {
    const matchId = "match-settle-payout-test";
    await prisma.match.create({
      data: {
        id: matchId,
        gameId: "cricket",
        status: "ACTIVE",
        stake: 100,
        players: {
          create: [
            { userId: userA, seat: 0 },
            { userId: userB, seat: 1 },
          ],
        },
      },
    });

    // Simulate entry fee already debited (-100 each)
    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userA, -100, "MATCH_WAGER", matchId);
      await applyTransaction(tx, userB, -100, "MATCH_WAGER", matchId);
    });

    // Settle with User A as winner
    const res = await GameCoinService.settleMatch(matchId, [userA], { rated: true });

    // Pot = 200, Payout = 180 (90%)
    expect(res.pot).toBe(200);
    expect(res.payouts).toEqual([{ userId: userA, amount: 180 }]);

    const walletA = await getWallet(userA);
    const walletB = await getWallet(userB);

    // User A: 1000 - 100 + 180 = 1080 (net +80)
    expect(walletA.balance).toBe(1080);
    // User B: 1000 - 100 = 900 (net -100)
    expect(walletB.balance).toBe(900);

    // Cleanup
    await prisma.match.delete({ where: { id: matchId } });
  });

  // =========================================================================
  // SCENARIO H: 5x Duplicate Settlement Calls (Idempotency)
  // =========================================================================
  it("Scenario H: Repeated settlement calls credit winnings exactly once", async () => {
    const matchId = "match-repeat-settle-test";
    await prisma.match.create({
      data: {
        id: matchId,
        gameId: "chess",
        status: "ACTIVE",
        stake: 100,
        players: {
          create: [
            { userId: userA, seat: 0 },
            { userId: userB, seat: 1 },
          ],
        },
      },
    });

    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userA, -100, "MATCH_WAGER", matchId);
      await applyTransaction(tx, userB, -100, "MATCH_WAGER", matchId);
    });

    // Settle 5 times consecutively
    for (let i = 0; i < 5; i++) {
      await GameCoinService.settleMatch(matchId, [userA]);
    }

    const walletA = await getWallet(userA);
    expect(walletA.balance).toBe(1080); // Credited only once!

    // Cleanup
    await prisma.match.delete({ where: { id: matchId } });
  });

  // =========================================================================
  // SCENARIO I: Match Draw Refund
  // =========================================================================
  it("Scenario I: Match draw refunds full entry fee to all players", async () => {
    const matchId = "match-draw-refund-test";
    await prisma.match.create({
      data: {
        id: matchId,
        gameId: "ludo",
        status: "ACTIVE",
        stake: 100,
        players: {
          create: [
            { userId: userA, seat: 0 },
            { userId: userB, seat: 1 },
          ],
        },
      },
    });

    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userA, -100, "MATCH_WAGER", matchId);
      await applyTransaction(tx, userB, -100, "MATCH_WAGER", matchId);
    });

    // Settle with empty winnerIds (Draw)
    const res = await GameCoinService.settleMatch(matchId, [], { resultType: "DRAW" });
    expect(res.payouts).toEqual(
      expect.arrayContaining([
        { userId: userA, amount: 100 },
        { userId: userB, amount: 100 },
      ]),
    );

    const walletA = await getWallet(userA);
    const walletB = await getWallet(userB);
    expect(walletA.balance).toBe(1000); // 1000 - 100 + 100 = 1000
    expect(walletB.balance).toBe(1000);

    // Cleanup
    await prisma.match.delete({ where: { id: matchId } });
  });

  // =========================================================================
  // SCENARIO J: Match Cancellation / Abort Refund
  // =========================================================================
  it("Scenario J: Active match cancellation refunds all players", async () => {
    const matchId = "match-cancel-refund-test";
    await prisma.match.create({
      data: {
        id: matchId,
        gameId: "snake-ladder",
        status: "ACTIVE",
        stake: 100,
        players: {
          create: [
            { userId: userA, seat: 0 },
            { userId: userB, seat: 1 },
          ],
        },
      },
    });

    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userA, -100, "MATCH_WAGER", matchId);
      await applyTransaction(tx, userB, -100, "MATCH_WAGER", matchId);
    });

    const res = await GameCoinService.cancelMatch(matchId, "opponent_disconnected");
    expect(res.status).toBe("CANCELLED");

    const walletA = await getWallet(userA);
    const walletB = await getWallet(userB);
    expect(walletA.balance).toBe(1000);
    expect(walletB.balance).toBe(1000);

    // Repeated cancel is idempotent
    const res2 = await GameCoinService.cancelMatch(matchId);
    expect(res2.status).toBe("ALREADY_FINISHED");

    // Cleanup
    await prisma.match.delete({ where: { id: matchId } });
  });

  // =========================================================================
  // SCENARIO K: Tournament Registration & Cancellation
  // =========================================================================
  it("Scenario K: Tournament registration deducts fee; cancellation refunds fee", async () => {
    const tournament = await prisma.tournament.create({
      data: {
        gameId: "carrom",
        title: "Test Championship",
        description: "Test",
        entryFee: 150,
        prizePool: 300,
        maxPlayers: 2,
        startTime: new Date(Date.now() + 3600000),
        status: "REGISTRATION_OPEN",
      },
    });

    // Register User A
    await registerForTournament(userA, tournament.id);
    const walletA1 = await getWallet(userA);
    expect(walletA1.balance).toBe(850);

    // Cancel registration
    await cancelRegistration(userA, tournament.id);
    const walletA2 = await getWallet(userA);
    expect(walletA2.balance).toBe(1000);

    // Cleanup
    await prisma.tournament.delete({ where: { id: tournament.id } });
  });

  // =========================================================================
  // SCENARIO L: Tournament Duplicate Registration Protection
  // =========================================================================
  it("Scenario L: Duplicate tournament registration is rejected without double fee", async () => {
    const tournament = await prisma.tournament.create({
      data: {
        gameId: "table-tennis",
        title: "Duplicate Reg Test",
        description: "Test",
        entryFee: 100,
        prizePool: 200,
        maxPlayers: 4,
        startTime: new Date(Date.now() + 3600000),
        status: "REGISTRATION_OPEN",
      },
    });

    await registerForTournament(userA, tournament.id);
    const wallet1 = await getWallet(userA);
    expect(wallet1.balance).toBe(900);

    // Attempt second registration
    await expect(registerForTournament(userA, tournament.id)).rejects.toThrow("already registered");

    const wallet2 = await getWallet(userA);
    expect(wallet2.balance).toBe(900); // No double fee

    // Cleanup
    await prisma.tournament.delete({ where: { id: tournament.id } });
  });

  // =========================================================================
  // SCENARIO M: Tournament Capacity Race Protection
  // =========================================================================
  it("Scenario M: Tournament capacity guard rejects entries once maxPlayers is reached", async () => {
    const tournament = await prisma.tournament.create({
      data: {
        gameId: "ludo",
        title: "Capacity Test",
        description: "Test",
        entryFee: 100,
        prizePool: 200,
        maxPlayers: 2,
        startTime: new Date(Date.now() + 3600000),
        status: "REGISTRATION_OPEN",
      },
    });

    await registerForTournament(userA, tournament.id);
    await registerForTournament(userB, tournament.id);

    // Third user attempts to register for 2-player tournament
    await expect(registerForTournament(userC, tournament.id)).rejects.toThrow("Tournament is full");

    const walletC = await getWallet(userC);
    expect(walletC.balance).toBe(1000); // Not charged

    // Cleanup
    await prisma.tournament.delete({ where: { id: tournament.id } });
  });

  // =========================================================================
  // SCENARIO N: Tournament Cancellation with Full Refunds
  // =========================================================================
  it("Scenario N: Cancelled tournament refunds entry fee to all registered players", async () => {
    const tournament = await prisma.tournament.create({
      data: {
        gameId: "chess",
        title: "Cancelled Tournament",
        description: "Test",
        entryFee: 200,
        prizePool: 400,
        maxPlayers: 2,
        startTime: new Date(Date.now() + 3600000),
        status: "REGISTRATION_OPEN",
      },
    });

    await registerForTournament(userA, tournament.id);
    await registerForTournament(userB, tournament.id);

    expect((await getWallet(userA)).balance).toBe(800);
    expect((await getWallet(userB)).balance).toBe(800);

    await cancelTournamentWithRefunds(tournament.id, "Admin cancellation");

    expect((await getWallet(userA)).balance).toBe(1000);
    expect((await getWallet(userB)).balance).toBe(1000);

    // Cleanup
    await prisma.tournament.delete({ where: { id: tournament.id } });
  });

  // =========================================================================
  // SCENARIO O: Tournament Prize Settlement Idempotency
  // =========================================================================
  it("Scenario O: Tournament prize settlement is idempotent and credits prizes once", async () => {
    const tournament = await prisma.tournament.create({
      data: {
        gameId: "carrom",
        title: "Prize Settle Test",
        description: "Test",
        entryFee: 100,
        prizePool: 200,
        grossPool: 200,
        prizeDistribution: [{ rank: 1, percentage: 100 }],
        maxPlayers: 2,
        startTime: new Date(Date.now() - 3600000),
        status: "COMPLETED",
        players: {
          create: [
            { userId: userA, finalRank: 1 },
            { userId: userB, finalRank: 2 },
          ],
        },
      },
    });

    // Settle tournament twice
    await settleTournament(tournament.id);
    await settleTournament(tournament.id);

    const walletA = await getWallet(userA);
    // Rank 1 prize: 200
    expect(walletA.balance).toBe(1200);

    // Cleanup
    await prisma.tournament.delete({ where: { id: tournament.id } });
  });

  // =========================================================================
  // SCENARIO P: Balance Reconciliation (balanceBefore - debit + credit = balanceAfter)
  // =========================================================================
  it("Scenario P: Financial ledger maintains strict mathematical balance reconciliation", async () => {
    const matchId = "recon-match-test";

    // 1. Debit entry fee
    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userA, -250, "MATCH_WAGER", matchId);
    });

    // 2. Credit winnings
    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userA, 450, "MATCH_PAYOUT", matchId);
    });

    const txs = await prisma.transaction.findMany({
      where: { userId: userA, referenceId: matchId },
      orderBy: { createdAt: "asc" },
    });

    expect(txs).toHaveLength(2);
    // 1000 - 250 = 750
    expect(txs[0].type).toBe("DEBIT");
    expect(txs[0].amount).toBe(250);
    expect(txs[0].balanceAfter).toBe(750);

    // 750 + 450 = 1200
    expect(txs[1].type).toBe("CREDIT");
    expect(txs[1].amount).toBe(450);
    expect(txs[1].balanceAfter).toBe(1200);

    const finalWallet = await getWallet(userA);
    expect(finalWallet.balance).toBe(1200);
  });
});
