import { describe, expect, it, beforeEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { GameCoinService } from "../gameCoinService";
import { WalletTransactionService } from "../walletTransactionService";
import { registerForTournament } from "../tournaments";
import { getWallet } from "../wallet";

describe("Feature 2: Atomic Entry Fee / Coin Deduction", () => {
  const player1 = "test-atomic-player-1";
  const player2 = "test-atomic-player-2";
  const player3 = "test-atomic-player-3";

  beforeEach(async () => {
    // Setup test users with wallets
    for (const uid of [player1, player2, player3]) {
      await prisma.user.upsert({
        where: { id: uid },
        create: {
          id: uid,
          email: `${uid}@test.local`,
          username: uid,
          displayName: `Player ${uid}`,
        },
        update: {},
      });

      await prisma.profile.upsert({
        where: { userId: uid },
        create: {
          userId: uid,
          coins: 1000,
        },
        update: {
          coins: 1000,
        },
      });

      await prisma.wallet.upsert({
        where: { userId: uid },
        create: {
          userId: uid,
          balance: 1000,
        },
        update: {
          balance: 1000,
          isFrozen: false,
        },
      });
    }

    // Clean up test transactions and matches
    await prisma.transaction.deleteMany({
      where: { userId: { in: [player1, player2, player3] } },
    });
    await prisma.tournamentPlayer.deleteMany({
      where: { userId: { in: [player1, player2, player3] } },
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Exact Balance
  // ---------------------------------------------------------------------------
  it("1. Exact balance: balance = 100, entryFee = 100 -> succeeds and new balance is exactly 0", async () => {
    // Set player1 balance to exactly 100
    await prisma.wallet.update({
      where: { userId: player1 },
      data: { balance: 100 },
    });
    // Set player2 balance to 100
    await prisma.wallet.update({
      where: { userId: player2 },
      data: { balance: 100 },
    });

    const matchId = `match-exact-balance-${Date.now()}`;
    const match = await GameCoinService.createAndFundMatch({
      matchId,
      gameId: "chess",
      stake: 100,
      players: [
        { userId: player1, seat: 0 },
        { userId: player2, seat: 1 },
      ],
    });

    expect(match.id).toBe(matchId);
    expect(match.status).toBe("ACTIVE");

    const w1 = await getWallet(player1);
    const w2 = await getWallet(player2);
    expect(w1.balance).toBe(0);
    expect(w2.balance).toBe(0);

    const history = await WalletTransactionService.listUserTransactions(player1, {}, 1, 10);
    expect(history.items).toHaveLength(1);
    expect(history.items[0].type).toBe("DEBIT");
    expect(history.items[0].amount).toBe(100);
    expect(history.items[0].balanceBefore).toBe(100);
    expect(history.items[0].balanceAfter).toBe(0);
    expect(history.items[0].referenceType).toBe("MATCH_WAGER");
    expect(history.items[0].referenceId).toBe(matchId);
  });

  // ---------------------------------------------------------------------------
  // 2. Insufficient Balance
  // ---------------------------------------------------------------------------
  it("2. Insufficient balance: balance = 99, entryFee = 100 -> rejects and balance remains 99", async () => {
    await prisma.wallet.update({
      where: { userId: player1 },
      data: { balance: 99 },
    });

    const matchId = `match-insufficient-${Date.now()}`;

    await expect(
      GameCoinService.createAndFundMatch({
        matchId,
        gameId: "chess",
        stake: 100,
        players: [
          { userId: player1, seat: 0 },
          { userId: player2, seat: 1 },
        ],
      }),
    ).rejects.toThrow();

    const w1 = await getWallet(player1);
    const w2 = await getWallet(player2);
    expect(w1.balance).toBe(99);
    expect(w2.balance).toBe(1000); // untouched

    // Match was never created in DB
    const matchInDb = await prisma.match.findUnique({ where: { id: matchId } });
    expect(matchInDb).toBeNull();

    // No transaction was recorded
    const history = await WalletTransactionService.listUserTransactions(player1, {}, 1, 10);
    expect(history.items).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 3. Successful Atomic Entry & Database Records
  // ---------------------------------------------------------------------------
  it("3. Successful entry: match, match players, wallet deductions, and transactions created atomically", async () => {
    const matchId = `match-success-${Date.now()}`;
    const match = await GameCoinService.createAndFundMatch({
      matchId,
      gameId: "carrom",
      stake: 100,
      players: [
        { userId: player1, seat: 0 },
        { userId: player2, seat: 1 },
      ],
    });

    expect(match.id).toBe(matchId);
    expect(match.status).toBe("ACTIVE");
    expect(match.stake).toBe(100);

    const players = await prisma.matchPlayer.findMany({ where: { matchId } });
    expect(players).toHaveLength(2);
    expect(players.map((p) => p.userId).sort()).toEqual([player1, player2].sort());

    const w1 = await getWallet(player1);
    const w2 = await getWallet(player2);
    expect(w1.balance).toBe(900);
    expect(w2.balance).toBe(900);

    const t1 = await prisma.transaction.findFirst({
      where: { userId: player1, referenceId: matchId },
    });
    expect(t1).not.toBeNull();
    expect(t1?.type).toBe("DEBIT");
    expect(t1?.amount).toBe(100);
    expect(t1?.balanceAfter).toBe(900);
  });

  // ---------------------------------------------------------------------------
  // 4. Failed Game Creation Rollback
  // ---------------------------------------------------------------------------
  it("4. Failed game creation rollback: error during creation leaves balances and ledger untouched", async () => {
    const initialBalance1 = (await getWallet(player1)).balance;
    const initialBalance2 = (await getWallet(player2)).balance;

    const matchId = `match-fail-rollback-${Date.now()}`;

    // Intentionally pass an invalid parameter that causes an error or simulate failure
    await expect(
      prisma.$transaction(async (tx) => {
        // Step 1: deduct coins
        await WalletTransactionService.createGameEntry(tx, {
          userId: player1,
          matchId,
          gameId: "chess",
          entryFee: 100,
        });
        // Step 2: throw error during game entry creation
        throw new Error("Simulated failure during game initialization");
      }),
    ).rejects.toThrow("Simulated failure during game initialization");

    const w1 = await getWallet(player1);
    const w2 = await getWallet(player2);
    expect(w1.balance).toBe(initialBalance1);
    expect(w2.balance).toBe(initialBalance2);

    const txCount = await prisma.transaction.count({
      where: { userId: player1, referenceId: matchId },
    });
    expect(txCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 5. Duplicate Join / Idempotency
  // ---------------------------------------------------------------------------
  it("5. Duplicate join: repeated calls for the same match do not double charge", async () => {
    const matchId = `match-idempotent-${Date.now()}`;
    const params = {
      matchId,
      gameId: "ludo" as const,
      stake: 100,
      players: [
        { userId: player1, seat: 0 },
        { userId: player2, seat: 1 },
      ],
    };

    // First call
    const m1 = await GameCoinService.createAndFundMatch(params);
    expect(m1.status).toBe("ACTIVE");

    // Second call with same matchId
    const m2 = await GameCoinService.createAndFundMatch(params);
    expect(m2.id).toBe(matchId);

    const w1 = await getWallet(player1);
    expect(w1.balance).toBe(900); // debited exactly once, NOT 800

    const history = await WalletTransactionService.listUserTransactions(player1, {}, 1, 10);
    expect(history.items).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 6 & 7. Concurrent Join & Multiple Tabs Protection
  // ---------------------------------------------------------------------------
  it("6 & 7. Concurrency / multiple tabs: simultaneous requests cannot double spend or make wallet negative", async () => {
    // Player 1 has 100 coins
    await prisma.wallet.update({
      where: { userId: player1 },
      data: { balance: 100 },
    });

    const matchIdA = `match-concurrent-A-${Date.now()}`;
    const matchIdB = `match-concurrent-B-${Date.now()}`;

    // Two simultaneous requests to spend 100 coins on two different matches
    const results = await Promise.allSettled([
      GameCoinService.createAndFundMatch({
        matchId: matchIdA,
        gameId: "fruit-ninja",
        stake: 100,
        players: [{ userId: player1, seat: 0 }, { userId: player2, seat: 1 }],
      }),
      GameCoinService.createAndFundMatch({
        matchId: matchIdB,
        gameId: "fruit-ninja",
        stake: 100,
        players: [{ userId: player1, seat: 0 }, { userId: player3, seat: 1 }],
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one must succeed and one must fail
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const w1 = await getWallet(player1);
    expect(w1.balance).toBe(0); // Never negative!
    expect(w1.balance).toBeGreaterThanOrEqual(0);

    const history = await WalletTransactionService.listUserTransactions(player1, {}, 1, 10);
    expect(history.items).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 8. Tournament Registration Atomic Entry Fee
  // ---------------------------------------------------------------------------
  it("8. Tournament registration: debits authoritative entry fee and records TOURNAMENT_ENTRY transaction", async () => {
    const tournamentId = `tourn-atomic-${Date.now()}`;
    const tournament = await prisma.tournament.create({
      data: {
        id: tournamentId,
        gameId: "chess",
        title: "Atomic Championship",
        description: "Test tournament",
        entryFee: 150,
        prizePool: 300,
        minPlayers: 2,
        maxPlayers: 4,
        startTime: new Date(Date.now() + 3600_000),
        status: "REGISTRATION_OPEN",
      },
    });

    const res = await registerForTournament(player1, tournament.id);
    expect(res.ok).toBe(true);

    const w1 = await getWallet(player1);
    expect(w1.balance).toBe(850);

    const playerEntry = await prisma.tournamentPlayer.findUnique({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: player1 } },
    });
    expect(playerEntry).not.toBeNull();

    const history = await WalletTransactionService.listUserTransactions(player1, {}, 1, 10);
    expect(history.items).toHaveLength(1);
    expect(history.items[0].referenceType).toBe("TOURNAMENT_ENTRY");
    expect(history.items[0].referenceId).toBe(tournament.id);
    expect(history.items[0].amount).toBe(150);
  });

  // ---------------------------------------------------------------------------
  // 9. Full Tournament Rejection
  // ---------------------------------------------------------------------------
  it("9. Full tournament: rejects registration and does not deduct entry fee", async () => {
    const tournamentId = `tourn-full-${Date.now()}`;
    const tournament = await prisma.tournament.create({
      data: {
        id: tournamentId,
        gameId: "ludo",
        title: "Full Tournament",
        description: "Test tournament",
        entryFee: 100,
        prizePool: 200,
        minPlayers: 2,
        maxPlayers: 2,
        startTime: new Date(Date.now() + 3600_000),
        status: "REGISTRATION_OPEN",
      },
    });

    // Register player1 and player2 to fill tournament
    await registerForTournament(player1, tournament.id);
    await registerForTournament(player2, tournament.id);

    const initialBalance3 = (await getWallet(player3)).balance;

    // Player3 attempts to register for full tournament
    await expect(registerForTournament(player3, tournament.id)).rejects.toThrow("Tournament is full");

    const w3 = await getWallet(player3);
    expect(w3.balance).toBe(initialBalance3);

    const tx3 = await prisma.transaction.findFirst({
      where: { userId: player3, referenceId: tournament.id },
    });
    expect(tx3).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 10. Concurrent Final Slot in Tournament
  // ---------------------------------------------------------------------------
  it("10. Concurrent final slot: exactly one registration succeeds when 1 slot remains", async () => {
    const tournamentId = `tourn-race-${Date.now()}`;
    const tournament = await prisma.tournament.create({
      data: {
        id: tournamentId,
        gameId: "carrom",
        title: "Race Tournament",
        description: "Test tournament",
        entryFee: 100,
        prizePool: 200,
        minPlayers: 2,
        maxPlayers: 2,
        startTime: new Date(Date.now() + 3600_000),
        status: "REGISTRATION_OPEN",
      },
    });

    // Fill 1 of 2 slots
    await registerForTournament(player1, tournament.id);

    // Player2 and Player3 race for the final slot
    const results = await Promise.allSettled([
      registerForTournament(player2, tournament.id),
      registerForTournament(player3, tournament.id),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const totalRegistered = await prisma.tournamentPlayer.count({
      where: { tournamentId: tournament.id },
    });
    expect(totalRegistered).toBe(2);

    const w2 = await getWallet(player2);
    const w3 = await getWallet(player3);

    // One got charged 100, other was untouched (1000)
    const balances = [w2.balance, w3.balance].sort((a, b) => a - b);
    expect(balances).toEqual([900, 1000]);
  });

  // ---------------------------------------------------------------------------
  // 11. Existing Match reserveMatchEntry Idempotency
  // ---------------------------------------------------------------------------
  it("11. reserveMatchEntry: debits CREATED match and is idempotent on repeat calls", async () => {
    const matchId = `match-reserve-${Date.now()}`;
    await prisma.match.create({
      data: {
        id: matchId,
        gameId: "table-tennis",
        status: "CREATED",
        stake: 100,
      },
    });
    await prisma.matchPlayer.createMany({
      data: [
        { matchId, userId: player1, seat: 0, result: "PENDING" },
        { matchId, userId: player2, seat: 1, result: "PENDING" },
      ],
    });

    const m1 = await GameCoinService.reserveMatchEntry(matchId);
    expect(m1.status).toBe("ACTIVE");

    const w1 = await getWallet(player1);
    expect(w1.balance).toBe(900);

    // Second call should return match without deducting again
    const m2 = await GameCoinService.reserveMatchEntry(matchId);
    expect(m2.status).toBe("ACTIVE");

    const w1After = await getWallet(player1);
    expect(w1After.balance).toBe(900);
  });

  // ---------------------------------------------------------------------------
  // 12. Full Match Lifecycle: Entry -> Settlement / Payout
  // ---------------------------------------------------------------------------
  it("12. Complete financial lifecycle: entry fee deduction followed by winner payout", async () => {
    const matchId = `match-lifecycle-${Date.now()}`;
    await GameCoinService.createAndFundMatch({
      matchId,
      gameId: "snake-ladder",
      stake: 100,
      players: [
        { userId: player1, seat: 0 },
        { userId: player2, seat: 1 },
      ],
    });

    expect((await getWallet(player1)).balance).toBe(900);
    expect((await getWallet(player2)).balance).toBe(900);

    // Settle with player1 as winner
    const settlement = await GameCoinService.settleMatch(matchId, [player1]);
    expect(settlement.winners).toContain(player1);

    // Total pot = 200, 90% prize pool = 180 coins
    expect((await getWallet(player1)).balance).toBe(900 + 180);
    expect((await getWallet(player2)).balance).toBe(900);

    const p1History = await WalletTransactionService.listUserTransactions(player1, {}, 1, 10);
    expect(p1History.items).toHaveLength(2); // Entry (DEBIT 100) + Prize (CREDIT 180)
    expect(p1History.items[0].type).toBe("CREDIT");
    expect(p1History.items[0].referenceType).toBe("MATCH_PAYOUT");
    expect(p1History.items[1].type).toBe("DEBIT");
    expect(p1History.items[1].referenceType).toBe("MATCH_WAGER");
  });

  // ---------------------------------------------------------------------------
  // 13. Match Cancellation Refund via Ledger
  // ---------------------------------------------------------------------------
  it("13. Match cancellation safely refunds entry wagers with full audit trail", async () => {
    const matchId = `match-cancel-${Date.now()}`;
    await GameCoinService.createAndFundMatch({
      matchId,
      gameId: "cricket",
      stake: 100,
      players: [
        { userId: player1, seat: 0 },
        { userId: player2, seat: 1 },
      ],
    });

    expect((await getWallet(player1)).balance).toBe(900);
    expect((await getWallet(player2)).balance).toBe(900);

    await GameCoinService.cancelMatch(matchId, "player_disconnected");

    expect((await getWallet(player1)).balance).toBe(1000);
    expect((await getWallet(player2)).balance).toBe(1000);

    const p1History = await WalletTransactionService.listUserTransactions(player1, {}, 1, 10);
    expect(p1History.items).toHaveLength(2); // DEBIT 100 + CREDIT 100 (refund)
    expect(p1History.items[0].type).toBe("CREDIT");
    expect(p1History.items[0].referenceType).toBe("WAGER_REFUND");
  });

  // ---------------------------------------------------------------------------
  // 14. Server Authoritative Entry Fee Enforcement
  // ---------------------------------------------------------------------------
  it("14. Server authoritative fee: rejects invalid entry fee not allowed for game", async () => {
    const matchId = `match-invalid-fee-${Date.now()}`;

    // 1 coin is not in the allowed entryFees for chess [50, 100, 500, 1000]
    await expect(
      GameCoinService.createAndFundMatch({
        matchId,
        gameId: "chess",
        stake: 1,
        players: [
          { userId: player1, seat: 0 },
          { userId: player2, seat: 1 },
        ],
      }),
    ).rejects.toThrow("not allowed for Chess");

    const w1 = await getWallet(player1);
    expect(w1.balance).toBe(1000);
  });
});
