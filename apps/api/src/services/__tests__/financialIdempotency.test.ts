import { describe, expect, it, beforeEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { IdempotencyService } from "../idempotencyService";
import { GameCoinService } from "../gameCoinService";
import { WalletTransactionService } from "../walletTransactionService";
import { registerForTournament } from "../tournaments";
import { settleTournament } from "../tournamentEngine";
import { getWallet } from "../wallet";

describe("Feature 3: Global Financial Idempotency System", () => {
  const userA = "test-idem-user-a";
  const userB = "test-idem-user-b";
  const userC = "test-idem-user-c";

  beforeEach(async () => {
    // Upsert test users and initialize wallets to 1000 coins
    for (const uid of [userA, userB, userC]) {
      await prisma.user.upsert({
        where: { id: uid },
        create: {
          id: uid,
          email: `${uid}@test.local`,
          username: uid,
          displayName: `Idem User ${uid}`,
        },
        update: {},
      });

      await prisma.profile.upsert({
        where: { userId: uid },
        create: { userId: uid, coins: 1000 },
        update: { coins: 1000 },
      });

      await prisma.wallet.upsert({
        where: { userId: uid },
        create: { userId: uid, balance: 1000 },
        update: { balance: 1000, isFrozen: false },
      });
    }

    // Clean up test transactions, idempotency records, matches, and tournament players
    await prisma.transaction.deleteMany({
      where: { userId: { in: [userA, userB, userC] } },
    });
    await prisma.idempotencyRecord.deleteMany({
      where: { userId: { in: [userA, userB, userC] } },
    });
    await prisma.tournamentPlayer.deleteMany({
      where: { userId: { in: [userA, userB, userC] } },
    });
  });

  // ---------------------------------------------------------------------------
  // 1. First Request Processing & Idempotency Storage
  // ---------------------------------------------------------------------------
  it("1. First request: executes operation, deducts coins, creates transaction, and stores COMPLETED result", async () => {
    const key = `ENTRY:test-match-1:${userA}`;
    const result = await IdempotencyService.executeOnce({
      key,
      operation: "GAME_ENTRY",
      userId: userA,
      referenceId: "test-match-1",
      handler: async (tx) => {
        return WalletTransactionService.createDebit(tx, {
          userId: userA,
          amount: 100,
          referenceType: "MATCH_WAGER",
          referenceId: "test-match-1",
          meta: { matchId: "test-match-1" },
        });
      },
    });

    expect(result.balance).toBe(900);

    const record = await IdempotencyService.getRecord(key);
    expect(record).not.toBeNull();
    expect(record?.status).toBe("COMPLETED");
    expect(record?.operation).toBe("GAME_ENTRY");
    expect(record?.userId).toBe(userA);
    expect(record?.referenceId).toBe("test-match-1");
    expect(record?.completedAt).not.toBeNull();

    const wallet = await getWallet(userA);
    expect(wallet.balance).toBe(900);

    const txCount = await prisma.transaction.count({
      where: { userId: userA, referenceId: "test-match-1" },
    });
    expect(txCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 2. Duplicate Request Handling
  // ---------------------------------------------------------------------------
  it("2. Duplicate request: returns existing result without deducting coins again", async () => {
    const key = `ENTRY:test-match-2:${userA}`;
    const handler = async (tx: any) => {
      return WalletTransactionService.createDebit(tx, {
        userId: userA,
        amount: 100,
        referenceType: "MATCH_WAGER",
        referenceId: "test-match-2",
      });
    };

    // First call
    const res1 = await IdempotencyService.executeOnce({
      key,
      operation: "GAME_ENTRY",
      userId: userA,
      handler,
    });
    expect(res1.balance).toBe(900);

    // Second call with same key
    const res2 = await IdempotencyService.executeOnce({
      key,
      operation: "GAME_ENTRY",
      userId: userA,
      handler,
    });
    expect(res2.balance).toBe(900);

    const wallet = await getWallet(userA);
    expect(wallet.balance).toBe(900); // untouched on 2nd call

    const txCount = await prisma.transaction.count({
      where: { userId: userA, referenceId: "test-match-2" },
    });
    expect(txCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 3. 10 Duplicate Sequential Requests
  // ---------------------------------------------------------------------------
  it("3. 10 duplicate requests: executing 10 times produces exactly 1 coin movement", async () => {
    const key = `ENTRY:test-match-seq10:${userA}`;
    const handler = async (tx: any) => {
      return WalletTransactionService.createDebit(tx, {
        userId: userA,
        amount: 50,
        referenceType: "MATCH_WAGER",
        referenceId: "test-match-seq10",
      });
    };

    for (let i = 0; i < 10; i++) {
      const res = await IdempotencyService.executeOnce({
        key,
        operation: "GAME_ENTRY",
        userId: userA,
        handler,
      });
      expect(res.balance).toBe(950);
    }

    const wallet = await getWallet(userA);
    expect(wallet.balance).toBe(950);

    const txCount = await prisma.transaction.count({
      where: { userId: userA, referenceId: "test-match-seq10" },
    });
    expect(txCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 4. Concurrent Duplicate Requests
  // ---------------------------------------------------------------------------
  it("4. Concurrent duplicate requests: simultaneous executions result in exactly 1 debit", async () => {
    const matchId = `match-concurrent-idem-${Date.now()}`;

    // 10 simultaneous requests to create and fund the same match
    const promises = Array.from({ length: 10 }).map(() =>
      GameCoinService.createAndFundMatch({
        matchId,
        gameId: "chess",
        stake: 100,
        players: [
          { userId: userA, seat: 0 },
          { userId: userB, seat: 1 },
        ],
      }),
    );

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === "fulfilled");

    // At least one fulfilled and returning the same matchId
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const wA = await getWallet(userA);
    const wB = await getWallet(userB);

    // Exactly 100 debited, never 1000 or negative
    expect(wA.balance).toBe(900);
    expect(wB.balance).toBe(900);

    const txA = await prisma.transaction.count({
      where: { userId: userA, referenceId: matchId },
    });
    const txB = await prisma.transaction.count({
      where: { userId: userB, referenceId: matchId },
    });
    expect(txA).toBe(1);
    expect(txB).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 5. Entry Fee Idempotency in Game Matches
  // ---------------------------------------------------------------------------
  it("5. Entry fee: repeat game creation calls do not double-debit entry fee", async () => {
    const matchId = `match-fee-idem-${Date.now()}`;
    const params = {
      matchId,
      gameId: "carrom" as const,
      stake: 100,
      players: [
        { userId: userA, seat: 0 },
        { userId: userB, seat: 1 },
      ],
    };

    const m1 = await GameCoinService.createAndFundMatch(params);
    const m2 = await GameCoinService.createAndFundMatch(params);

    expect(m1.id).toBe(matchId);
    expect(m2.id).toBe(matchId);

    const wA = await getWallet(userA);
    expect(wA.balance).toBe(900);

    const history = await WalletTransactionService.listUserTransactions(userA, {}, 1, 10);
    expect(history.items).toHaveLength(1);
    expect(history.items[0].amount).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // 6. Match Winning / Prize Idempotency
  // ---------------------------------------------------------------------------
  it("6. Winning: repeat settlement calls credit the winner prize exactly once", async () => {
    const matchId = `match-win-idem-${Date.now()}`;
    await GameCoinService.createAndFundMatch({
      matchId,
      gameId: "ludo",
      stake: 100,
      players: [
        { userId: userA, seat: 0 },
        { userId: userB, seat: 1 },
      ],
    });

    expect((await getWallet(userA)).balance).toBe(900);

    // Call settleMatch 3 times
    const s1 = await GameCoinService.settleMatch(matchId, [userA]);
    const s2 = await GameCoinService.settleMatch(matchId, [userA]);
    const s3 = await GameCoinService.settleMatch(matchId, [userA]);

    expect(s1.winners).toContain(userA);
    expect(s2.winners).toContain(userA);
    expect(s3.winners).toContain(userA);

    // Pot = 200, 90% prize pool = 180 coins
    const wA = await getWallet(userA);
    expect(wA.balance).toBe(900 + 180); // 1080 (never 900 + 180 + 180 + 180)

    const prizeTxs = await prisma.transaction.findMany({
      where: { userId: userA, referenceType: "MATCH_PAYOUT", referenceId: matchId },
    });
    expect(prizeTxs).toHaveLength(1);
    expect(prizeTxs[0].amount).toBe(180);
  });

  // ---------------------------------------------------------------------------
  // 7. Refund Idempotency
  // ---------------------------------------------------------------------------
  it("7. Refund: repeated match cancellation credits refund exactly once", async () => {
    const matchId = `match-refund-idem-${Date.now()}`;
    await GameCoinService.createAndFundMatch({
      matchId,
      gameId: "cricket",
      stake: 100,
      players: [
        { userId: userA, seat: 0 },
        { userId: userB, seat: 1 },
      ],
    });

    expect((await getWallet(userA)).balance).toBe(900);
    expect((await getWallet(userB)).balance).toBe(900);

    // Cancel match 5 times
    for (let i = 0; i < 5; i++) {
      await GameCoinService.cancelMatch(matchId, "test_abort");
    }

    const wA = await getWallet(userA);
    const wB = await getWallet(userB);
    expect(wA.balance).toBe(1000); // exactly refunded 100, not 500!
    expect(wB.balance).toBe(1000);

    const refundsA = await prisma.transaction.findMany({
      where: { userId: userA, referenceType: "WAGER_REFUND", referenceId: matchId },
    });
    expect(refundsA).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 8. Tournament Prize Idempotency
  // ---------------------------------------------------------------------------
  it("8. Tournament prize: settleTournament called multiple times credits rank prize once", async () => {
    const tournamentId = `tourn-prize-idem-${Date.now()}`;
    const tournament = await prisma.tournament.create({
      data: {
        id: tournamentId,
        gameId: "chess",
        title: "Idem Championship",
        description: "Test prize idempotency",
        entryFee: 100,
        prizePool: 500,
        minPlayers: 2,
        maxPlayers: 2,
        startTime: new Date(),
        status: "IN_PROGRESS",
      },
    });

    await prisma.tournamentPlayer.createMany({
      data: [
        { tournamentId, userId: userA, finalRank: 1 },
        { tournamentId, userId: userB, finalRank: 2 },
      ],
    });

    const initialBalanceA = (await getWallet(userA)).balance;

    // Run settleTournament 3 times
    await settleTournament(tournamentId);
    await settleTournament(tournamentId);
    await settleTournament(tournamentId);

    const wA = await getWallet(userA);
    // Rank 1 gets default 60% of 500 = 300 coins
    expect(wA.balance).toBe(initialBalanceA + 300);

    const prizeTxs = await prisma.transaction.findMany({
      where: { userId: userA, referenceType: "TOURNAMENT_PRIZE", referenceId: tournamentId },
    });
    expect(prizeTxs).toHaveLength(1);
    expect(prizeTxs[0].amount).toBe(300);
  });

  // ---------------------------------------------------------------------------
  // 9. Tournament Registration Idempotency
  // ---------------------------------------------------------------------------
  it("9. Tournament registration: duplicate registration calls do not double charge entry fee", async () => {
    const tournamentId = `tourn-reg-idem-${Date.now()}`;
    await prisma.tournament.create({
      data: {
        id: tournamentId,
        gameId: "table-tennis",
        title: "Registration Test",
        description: "Test registration idempotency",
        entryFee: 100,
        prizePool: 200,
        minPlayers: 2,
        maxPlayers: 4,
        startTime: new Date(Date.now() + 3600_000),
        status: "REGISTRATION_OPEN",
      },
    });

    const r1 = await registerForTournament(userA, tournamentId);
    expect(r1.ok).toBe(true);

    // Repeated registration is rejected without double debit
    await expect(registerForTournament(userA, tournamentId)).rejects.toThrow("You are already registered");

    const wA = await getWallet(userA);
    expect(wA.balance).toBe(900); // exactly 1 debit of 100

    const txs = await prisma.transaction.findMany({
      where: { userId: userA, referenceType: "TOURNAMENT_ENTRY", referenceId: tournamentId },
    });
    expect(txs).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 10. Match Settlement Idempotency (settle() settle() settle())
  // ---------------------------------------------------------------------------
  it("10. Match settlement: calling settleMatch 5 times produces exactly 1 financial settlement", async () => {
    const matchId = `match-5settle-${Date.now()}`;
    await GameCoinService.createAndFundMatch({
      matchId,
      gameId: "fruit-ninja",
      stake: 100,
      players: [
        { userId: userA, seat: 0 },
        { userId: userB, seat: 1 },
      ],
    });

    const results = await Promise.all([
      GameCoinService.settleMatch(matchId, [userA]),
      GameCoinService.settleMatch(matchId, [userA]),
      GameCoinService.settleMatch(matchId, [userA]),
      GameCoinService.settleMatch(matchId, [userA]),
      GameCoinService.settleMatch(matchId, [userA]),
    ]);

    for (const r of results) {
      expect(r.matchId).toBe(matchId);
    }

    const wA = await getWallet(userA);
    expect(wA.balance).toBe(900 + 180); // 1080

    const txs = await prisma.transaction.findMany({
      where: { userId: userA, referenceType: "MATCH_PAYOUT", referenceId: matchId },
    });
    expect(txs).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 11. HTTP Retry Simulation
  // ---------------------------------------------------------------------------
  it("11. HTTP retry simulation: client retrying after connection drop receives same result without duplicate debit", async () => {
    const key = `ENTRY:http-retry-match:${userA}`;

    // Simulate initial HTTP request handler
    const makeHttpRequest = async () => {
      return IdempotencyService.executeOnce({
        key,
        operation: "GAME_ENTRY",
        userId: userA,
        handler: async (tx) => {
          return WalletTransactionService.createDebit(tx, {
            userId: userA,
            amount: 100,
            referenceType: "MATCH_WAGER",
            referenceId: "http-retry-match",
          });
        },
      });
    };

    // First request executes
    const firstResponse = await makeHttpRequest();
    expect(firstResponse.balance).toBe(900);

    // Client timed out waiting for socket/HTTP packet, retries request
    const retryResponse = await makeHttpRequest();
    expect(retryResponse.balance).toBe(900);

    const wA = await getWallet(userA);
    expect(wA.balance).toBe(900);

    const count = await prisma.transaction.count({
      where: { userId: userA, referenceId: "http-retry-match" },
    });
    expect(count).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 12. Socket Retry Simulation
  // ---------------------------------------------------------------------------
  it("12. Socket retry simulation: re-emitted socket event does not double charge", async () => {
    const matchId = `match-socket-retry-${Date.now()}`;
    const params = {
      matchId,
      gameId: "snake-ladder" as const,
      stake: 100,
      players: [
        { userId: userA, seat: 0 },
        { userId: userB, seat: 1 },
      ],
    };

    // Socket server emits match start
    await GameCoinService.createAndFundMatch(params);

    // Socket disconnect / reconnect causes socket client to resend match launch
    await GameCoinService.createAndFundMatch(params);

    const wA = await getWallet(userA);
    const wB = await getWallet(userB);
    expect(wA.balance).toBe(900);
    expect(wB.balance).toBe(900);
  });

  // ---------------------------------------------------------------------------
  // 13. Browser Refresh Simulation
  // ---------------------------------------------------------------------------
  it("13. Browser refresh simulation: page refresh during match loading reuses existing entry", async () => {
    const matchId = `match-browser-refresh-${Date.now()}`;
    const key = `ENTRY:${matchId}:${userA}`;

    // Page load 1
    await IdempotencyService.executeOnce({
      key,
      operation: "GAME_ENTRY",
      userId: userA,
      handler: async (tx) => {
        return WalletTransactionService.createDebit(tx, {
          userId: userA,
          amount: 100,
          referenceType: "MATCH_WAGER",
          referenceId: matchId,
        });
      },
    });

    // Immediate browser refresh triggers page load 2 with same deterministic key
    await IdempotencyService.executeOnce({
      key,
      operation: "GAME_ENTRY",
      userId: userA,
      handler: async (tx) => {
        return WalletTransactionService.createDebit(tx, {
          userId: userA,
          amount: 100,
          referenceType: "MATCH_WAGER",
          referenceId: matchId,
        });
      },
    });

    const wA = await getWallet(userA);
    expect(wA.balance).toBe(900);
  });

  // ---------------------------------------------------------------------------
  // 14. Multiple Tabs Simulation
  // ---------------------------------------------------------------------------
  it("14. Multiple tabs simulation: 2 tabs submitting identical operations result in 1 financial debit", async () => {
    const key = `ENTRY:tab-race-match:${userA}`;

    const tabA = IdempotencyService.executeOnce({
      key,
      operation: "GAME_ENTRY",
      userId: userA,
      handler: async (tx) => {
        return WalletTransactionService.createDebit(tx, {
          userId: userA,
          amount: 100,
          referenceType: "MATCH_WAGER",
          referenceId: "tab-race-match",
        });
      },
    });

    const tabB = IdempotencyService.executeOnce({
      key,
      operation: "GAME_ENTRY",
      userId: userA,
      handler: async (tx) => {
        return WalletTransactionService.createDebit(tx, {
          userId: userA,
          amount: 100,
          referenceType: "MATCH_WAGER",
          referenceId: "tab-race-match",
        });
      },
    });

    const [resA, resB] = await Promise.allSettled([tabA, tabB]);

    // At least one fulfilled
    const fulfilled = [resA, resB].filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const wA = await getWallet(userA);
    expect(wA.balance).toBe(900); // 100 deducted exactly once
  });

  // ---------------------------------------------------------------------------
  // 15. Server Restart / Uncommitted Operation Rollback
  // ---------------------------------------------------------------------------
  it("15. Server restart simulation: uncommitted operation leaves 0 traces in ledger and allows retry", async () => {
    const key = `ENTRY:crash-match:${userA}`;

    // Simulate crash during execution
    await expect(
      IdempotencyService.executeOnce({
        key,
        operation: "GAME_ENTRY",
        userId: userA,
        handler: async (tx) => {
          await WalletTransactionService.createDebit(tx, {
            userId: userA,
            amount: 100,
            referenceType: "MATCH_WAGER",
            referenceId: "crash-match",
          });
          throw new Error("Simulated sudden server crash / abort");
        },
      }),
    ).rejects.toThrow("Simulated sudden server crash / abort");

    // Verify wallet is completely intact
    const wA = await getWallet(userA);
    expect(wA.balance).toBe(1000);

    // Verify no COMPLETED record was saved
    const record = await IdempotencyService.getRecord(key);
    expect(record).toBeNull();

    // Verify server restart allows successful retry of operation
    const successRes = await IdempotencyService.executeOnce({
      key,
      operation: "GAME_ENTRY",
      userId: userA,
      handler: async (tx) => {
        return WalletTransactionService.createDebit(tx, {
          userId: userA,
          amount: 100,
          referenceType: "MATCH_WAGER",
          referenceId: "crash-match",
        });
      },
    });

    expect(successRes.balance).toBe(900);
    expect((await getWallet(userA)).balance).toBe(900);
  });

  // ---------------------------------------------------------------------------
  // 16. Wrong-User Idempotency Key Rejection (Security)
  // ---------------------------------------------------------------------------
  it("16. Wrong-user security: user B cannot execute or access user A's idempotency key", async () => {
    const key = `ENTRY:secure-match:${userA}`;

    // User A executes
    await IdempotencyService.executeOnce({
      key,
      operation: "GAME_ENTRY",
      userId: userA,
      handler: async (tx) => {
        return WalletTransactionService.createDebit(tx, {
          userId: userA,
          amount: 100,
          referenceType: "MATCH_WAGER",
          referenceId: "secure-match",
        });
      },
    });

    // User B attempts to execute with User A's key
    await expect(
      IdempotencyService.executeOnce({
        key,
        operation: "GAME_ENTRY",
        userId: userB,
        handler: async (tx) => {
          return WalletTransactionService.createDebit(tx, {
            userId: userB,
            amount: 100,
            referenceType: "MATCH_WAGER",
            referenceId: "secure-match",
          });
        },
      }),
    ).rejects.toThrow("does not match authenticated user");
  });

  // ---------------------------------------------------------------------------
  // 17. Malformed Key Validation
  // ---------------------------------------------------------------------------
  it("17. Malformed key: rejects empty, overly long, or invalid character keys", () => {
    expect(() => IdempotencyService.validateKey("")).toThrow("Idempotency key is required");
    expect(() => IdempotencyService.validateKey("a")).toThrow("must be between 3 and 255 characters");
    expect(() => IdempotencyService.validateKey("a".repeat(300))).toThrow("must be between 3 and 255 characters");
    expect(() => IdempotencyService.validateKey("INVALID KEY WITH SPACES")).toThrow("contains invalid characters");
    expect(() => IdempotencyService.validateKey("KEY;DROP TABLE;")).toThrow("contains invalid characters");
  });

  // ---------------------------------------------------------------------------
  // 18. Failed Operation Retry
  // ---------------------------------------------------------------------------
  it("18. Failed operation retry: if balance is insufficient, fixing balance allows successful retry", async () => {
    // Set userA balance to 50
    await prisma.wallet.update({
      where: { userId: userA },
      data: { balance: 50 },
    });

    const key = `ENTRY:retryable-match:${userA}`;

    // First attempt fails due to insufficient balance
    await expect(
      IdempotencyService.executeOnce({
        key,
        operation: "GAME_ENTRY",
        userId: userA,
        handler: async (tx) => {
          return WalletTransactionService.createDebit(tx, {
            userId: userA,
            amount: 100,
            referenceType: "MATCH_WAGER",
            referenceId: "retryable-match",
          });
        },
      }),
    ).rejects.toThrow();

    // User deposits / receives funds (balance = 500)
    await prisma.wallet.update({
      where: { userId: userA },
      data: { balance: 500 },
    });

    // Retry with the same key now succeeds
    const successRes = await IdempotencyService.executeOnce({
      key,
      operation: "GAME_ENTRY",
      userId: userA,
      handler: async (tx) => {
        return WalletTransactionService.createDebit(tx, {
          userId: userA,
          amount: 100,
          referenceType: "MATCH_WAGER",
          referenceId: "retryable-match",
        });
      },
    });

    expect(successRes.balance).toBe(400);
    expect((await getWallet(userA)).balance).toBe(400);
  });
});
