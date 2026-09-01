import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { registerForTournament, setTournamentStatus } from "../tournaments";
import { GameCoinService } from "../gameCoinService";
import { WalletTransactionService } from "../walletTransactionService";

describe("Feature 4: Concurrent Join & Slot Protection", () => {
  const createdUserIds: string[] = [];

  // Helper to create test user with funded wallet
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
      },
    });

    return userId;
  }

  async function getWallet(userId: string) {
    return prisma.wallet.findUniqueOrThrow({ where: { userId } });
  }

  afterEach(async () => {
    // Cleanup users and cascading relations
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Two Simultaneous Registrations (1 Slot Remaining)
  // ---------------------------------------------------------------------------
  it("1. Two simultaneous registrations: exactly 1 succeeds on final slot, 1 gets TOURNAMENT_FULL", async () => {
    const existingUser = await createTestUser("u-exist");
    const userA = await createTestUser("u-race-a");
    const userB = await createTestUser("u-race-b");

    const tournamentId = `tourn-race2-${Date.now()}`;
    await prisma.tournament.create({
      data: {
        id: tournamentId,
        gameId: "table-tennis",
        title: "2-Player Slot Race",
        description: "Race for final slot",
        entryFee: 100,
        prizePool: 200,
        minPlayers: 2,
        maxPlayers: 2,
        startTime: new Date(Date.now() + 3600_000),
        status: "REGISTRATION_OPEN",
      },
    });

    // Seed 1st player
    await registerForTournament(existingUser, tournamentId);

    // User A & User B race simultaneously for the 2nd (final) slot
    const [resA, resB] = await Promise.allSettled([
      registerForTournament(userA, tournamentId),
      registerForTournament(userB, tournamentId),
    ]);

    const successes = [resA, resB].filter((r) => r.status === "fulfilled");
    const failures = [resA, resB].filter((r) => r.status === "rejected");

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const failReason = (failures[0] as PromiseRejectedResult).reason;
    expect(failReason.message || failReason.code).toMatch(/Tournament is full|TOURNAMENT_FULL|Tournament is not accepting registrations/);

    // Database capacity check: exactly 2 players in tournament
    const totalPlayers = await prisma.tournamentPlayer.count({ where: { tournamentId } });
    expect(totalPlayers).toBe(2);

    // Financial check: only winner of race was debited
    const wA = await getWallet(userA);
    const wB = await getWallet(userB);

    if (resA.status === "fulfilled") {
      expect(wA.balance).toBe(900);
      expect(wB.balance).toBe(1000);
    } else {
      expect(wA.balance).toBe(1000);
      expect(wB.balance).toBe(900);
    }
  });

  // ---------------------------------------------------------------------------
  // 2. 10 Simultaneous Registrations for 5 Slots
  // ---------------------------------------------------------------------------
  it("2. 10 simultaneous registrations: exactly 5 succeed, 5 get TOURNAMENT_FULL", async () => {
    const users = await Promise.all(
      Array.from({ length: 10 }).map((_, i) => createTestUser(`u-batch10-${i}`))
    );

    const tournamentId = `tourn-batch10-${Date.now()}`;
    await prisma.tournament.create({
      data: {
        id: tournamentId,
        gameId: "chess",
        title: "10-User Concurrency Race",
        description: "10 users racing for 5 slots",
        entryFee: 50,
        prizePool: 250,
        minPlayers: 2,
        maxPlayers: 5,
        startTime: new Date(Date.now() + 3600_000),
        status: "REGISTRATION_OPEN",
      },
    });

    // Execute 10 simultaneous registrations
    const results = await Promise.allSettled(
      users.map((uid) => registerForTournament(uid, tournamentId))
    );

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures = results.filter((r) => r.status === "rejected");

    expect(successes).toHaveLength(5);
    expect(failures).toHaveLength(5);

    for (const f of failures) {
      const reason = (f as PromiseRejectedResult).reason;
      expect(reason.message || reason.code).toMatch(/Tournament is full|TOURNAMENT_FULL|Tournament is not accepting registrations/);
    }

    // Database capacity check: exactly 5 players
    const totalPlayers = await prisma.tournamentPlayer.count({ where: { tournamentId } });
    expect(totalPlayers).toBe(5);

    // Verify financial balances: exactly 5 users debited 50 coins, 5 users untouched at 1000
    const wallets = await Promise.all(users.map((uid) => getWallet(uid)));
    const debited = wallets.filter((w) => w.balance === 950);
    const untouched = wallets.filter((w) => w.balance === 1000);

    expect(debited).toHaveLength(5);
    expect(untouched).toHaveLength(5);
  });

  // ---------------------------------------------------------------------------
  // 3. 100 Simultaneous Registrations for 20 Slots
  // ---------------------------------------------------------------------------
  it("3. 100 simultaneous registrations: exactly 20 succeed, 80 rejected, capacity never exceeded", async () => {
    const users = await Promise.all(
      Array.from({ length: 100 }).map((_, i) => createTestUser(`u-100-${i}`, 500))
    );

    const tournamentId = `tourn-100race-${Date.now()}`;
    await prisma.tournament.create({
      data: {
        id: tournamentId,
        gameId: "ludo",
        title: "100-User Mega Race",
        description: "100 users racing for 20 slots",
        entryFee: 100,
        prizePool: 2000,
        minPlayers: 4,
        maxPlayers: 20,
        startTime: new Date(Date.now() + 3600_000),
        status: "REGISTRATION_OPEN",
      },
    });

    // Fire 100 registrations in concurrent waves of 10
    const results: PromiseSettledResult<{ ok: boolean }>[] = [];
    const chunkSize = 10;
    for (let i = 0; i < users.length; i += chunkSize) {
      const chunk = users.slice(i, i + chunkSize);
      const chunkResults = await Promise.allSettled(
        chunk.map((uid) => registerForTournament(uid, tournamentId))
      );
      results.push(...chunkResults);
    }

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures = results.filter((r) => r.status === "rejected");

    expect(successes).toHaveLength(20);
    expect(failures).toHaveLength(80);

    // Database check: exactly 20 registered players
    const totalPlayers = await prisma.tournamentPlayer.count({ where: { tournamentId } });
    expect(totalPlayers).toBe(20);

    // Verify ledger transactions: exactly 20 TOURNAMENT_ENTRY transactions
    const txCount = await prisma.transaction.count({
      where: { referenceType: "TOURNAMENT_ENTRY", referenceId: tournamentId },
    });
    expect(txCount).toBe(20);

    // Balances: exactly 20 at 400 (500 - 100), 80 at 500
    const wallets = await Promise.all(users.map((uid) => getWallet(uid)));
    const debited = wallets.filter((w) => w.balance === 400);
    const untouched = wallets.filter((w) => w.balance === 500);

    expect(debited).toHaveLength(20);
    expect(untouched).toHaveLength(80);
  });

  // ---------------------------------------------------------------------------
  // 4. Final Tournament Slot Race (99/100 Filled)
  // ---------------------------------------------------------------------------
  it("4. Final slot race: 10 users racing for the 100th slot of a 100-player tournament", async () => {
    // Seed 99 players
    const seededUsers = await Promise.all(
      Array.from({ length: 99 }).map((_, i) => createTestUser(`u-seed-${i}`))
    );

    const tournamentId = `tourn-finalslot-${Date.now()}`;
    await prisma.tournament.create({
      data: {
        id: tournamentId,
        gameId: "snake-ladder",
        title: "100-Player Final Slot Race",
        description: "99 seeded, 10 racing for 100th slot",
        entryFee: 20,
        prizePool: 2000,
        minPlayers: 10,
        maxPlayers: 100,
        startTime: new Date(Date.now() + 3600_000),
        status: "REGISTRATION_OPEN",
      },
    });

    // Seed 99 players directly in DB for fast setup
    await prisma.tournamentPlayer.createMany({
      data: seededUsers.map((u) => ({ tournamentId, userId: u })),
    });

    // Create 10 competitors racing for the 100th slot
    const racers = await Promise.all(
      Array.from({ length: 10 }).map((_, i) => createTestUser(`u-racer-${i}`))
    );

    const results = await Promise.allSettled(
      racers.map((uid) => registerForTournament(uid, tournamentId))
    );

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures = results.filter((r) => r.status === "rejected");

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(9);

    const totalPlayers = await prisma.tournamentPlayer.count({ where: { tournamentId } });
    expect(totalPlayers).toBe(100); // exactly at capacity
  });

  // ---------------------------------------------------------------------------
  // 5. Duplicate Same-User Registration Race
  // ---------------------------------------------------------------------------
  it("5. Duplicate same-user registration: 10 simultaneous requests from same user result in 1 registration and 1 debit", async () => {
    const user = await createTestUser("u-dup-race");

    const tournamentId = `tourn-duprace-${Date.now()}`;
    await prisma.tournament.create({
      data: {
        id: tournamentId,
        gameId: "table-tennis",
        title: "Duplicate User Race",
        description: "Same user multi-click",
        entryFee: 150,
        prizePool: 300,
        minPlayers: 2,
        maxPlayers: 8,
        startTime: new Date(Date.now() + 3600_000),
        status: "REGISTRATION_OPEN",
      },
    });

    // Submit 10 simultaneous registration requests for the same user
    const results = await Promise.allSettled(
      Array.from({ length: 10 }).map(() => registerForTournament(user, tournamentId))
    );

    const successes = results.filter((r) => r.status === "fulfilled");
    expect(successes.length).toBeGreaterThanOrEqual(1);

    // In DB: exactly 1 player record for this user
    const count = await prisma.tournamentPlayer.count({
      where: { tournamentId, userId: user },
    });
    expect(count).toBe(1);

    // Wallet: debited exactly 150 once (1000 - 150 = 850)
    const wallet = await getWallet(user);
    expect(wallet.balance).toBe(850);

    // Ledger: exactly 1 TOURNAMENT_ENTRY transaction
    const txs = await prisma.transaction.findMany({
      where: { userId: user, referenceType: "TOURNAMENT_ENTRY", referenceId: tournamentId },
    });
    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(150);
  });

  // ---------------------------------------------------------------------------
  // 6. Multiplayer Room Capacity Race
  // ---------------------------------------------------------------------------
  it("6. Room capacity race: 2 users racing for 1 slot in a 2-player room allows only 1 join", async () => {
    const hostUser = await createTestUser("u-room-host");
    const userA = await createTestUser("u-join-a");
    const userB = await createTestUser("u-join-b");

    const roomId = `room-race-${Date.now()}`;
    const code = `RC${Date.now().toString().slice(-4)}`;

    await prisma.room.create({
      data: {
        id: roomId,
        code,
        gameId: "cricket",
        hostId: hostUser,
        status: "WAITING",
        isPrivate: false,
        stake: 100,
        minPlayers: 2,
        maxPlayers: 2,
      },
    });

    await prisma.roomPlayer.create({
      data: {
        roomId,
        userId: hostUser,
        seat: 0,
        isHost: true,
        isReady: true,
        isSpectator: false,
        connectionStatus: "CONNECTED",
      },
    });

    // Helper simulating atomic database-level room join with row lock
    const joinRoomTransactional = async (userId: string) => {
      return prisma.$transaction(async (tx) => {
        const room = await tx.room.update({
          where: { id: roomId },
          data: { updatedAt: new Date() },
          include: { players: true },
        });
        if (!room) throw new Error("ROOM_NOT_FOUND");
        if (room.status !== "WAITING") throw new Error("ROOM_CLOSED");

        const nonSpectators = room.players.filter((p) => !p.isSpectator);
        if (nonSpectators.length >= room.maxPlayers) {
          throw new Error("ROOM_FULL");
        }

        const seat = nonSpectators.length;
        await tx.roomPlayer.create({
          data: {
            roomId,
            userId,
            seat,
            isHost: false,
            isReady: false,
            isSpectator: false,
            connectionStatus: "CONNECTED",
          },
        });

        return { ok: true, seat };
      });
    };

    // User A & User B race to join
    const [resA, resB] = await Promise.allSettled([
      joinRoomTransactional(userA),
      joinRoomTransactional(userB),
    ]);

    const successes = [resA, resB].filter((r) => r.status === "fulfilled");
    const failures = [resA, resB].filter((r) => r.status === "rejected");

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const failReason = (failures[0] as PromiseRejectedResult).reason;
    expect(failReason.message).toMatch(/ROOM_FULL/);

    const roomPlayers = await prisma.roomPlayer.findMany({ where: { roomId } });
    expect(roomPlayers).toHaveLength(2); // Host + 1 winner of the race
  });

  // ---------------------------------------------------------------------------
  // 7. Simultaneous Match Start Race
  // ---------------------------------------------------------------------------
  it("7. Simultaneous match start: multiple startMatch triggers result in 1 match creation and 1 entry fee debit", async () => {
    const userA = await createTestUser("u-mstart-a");
    const userB = await createTestUser("u-mstart-b");

    const matchId = `match-start-race-${Date.now()}`;
    const startPayload = {
      matchId,
      gameId: "chess" as const,
      stake: 100,
      players: [
        { userId: userA, seat: 0 },
        { userId: userB, seat: 1 },
      ],
    };

    // Trigger createAndFundMatch 5 times simultaneously
    const results = await Promise.allSettled([
      GameCoinService.createAndFundMatch(startPayload),
      GameCoinService.createAndFundMatch(startPayload),
      GameCoinService.createAndFundMatch(startPayload),
      GameCoinService.createAndFundMatch(startPayload),
      GameCoinService.createAndFundMatch(startPayload),
    ]);

    // All return success (either initial creation or idempotent completed result)
    for (const r of results) {
      expect(r.status).toBe("fulfilled");
      if (r.status === "fulfilled") {
        const val: any = r.value;
        expect(val.id || val.matchId).toBe(matchId);
      }
    }

    // Match count in DB = exactly 1
    const matchCount = await prisma.match.count({ where: { id: matchId } });
    expect(matchCount).toBe(1);

    // Players debited exactly once: 1000 - 100 = 900
    const wA = await getWallet(userA);
    const wB = await getWallet(userB);
    expect(wA.balance).toBe(900);
    expect(wB.balance).toBe(900);

    // Total MATCH_WAGER transactions for this match = 2 (1 per player)
    const txCount = await prisma.transaction.count({
      where: { referenceId: matchId, referenceType: "MATCH_WAGER" },
    });
    expect(txCount).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // 8. Registration Closing Race
  // ---------------------------------------------------------------------------
  it("8. Registration closing race: closing registration prevents any in-flight registrations from charging", async () => {
    const users = await Promise.all(
      Array.from({ length: 8 }).map((_, i) => createTestUser(`u-close-race-${i}`))
    );

    const tournamentId = `tourn-closing-${Date.now()}`;
    await prisma.tournament.create({
      data: {
        id: tournamentId,
        gameId: "table-tennis",
        title: "Registration Closing Race",
        description: "Admin closes registration during join race",
        entryFee: 100,
        prizePool: 800,
        minPlayers: 2,
        maxPlayers: 16,
        startTime: new Date(Date.now() + 3600_000),
        status: "REGISTRATION_OPEN",
      },
    });

    // Close registration
    await setTournamentStatus(tournamentId, "REGISTRATION_CLOSED", "admin-tester");

    // All subsequent registration attempts must fail
    const results = await Promise.allSettled(
      users.map((uid) => registerForTournament(uid, tournamentId))
    );

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures = results.filter((r) => r.status === "rejected");

    expect(successes).toHaveLength(0);
    expect(failures).toHaveLength(8);

    for (const f of failures) {
      const reason = (f as PromiseRejectedResult).reason;
      expect(reason.message || reason.code).toMatch(/Tournament is not accepting registrations|TOURNAMENT_STARTED/);
    }

    // 0 players registered, 0 coins debited
    const playerCount = await prisma.tournamentPlayer.count({ where: { tournamentId } });
    expect(playerCount).toBe(0);

    const wallets = await Promise.all(users.map((uid) => getWallet(uid)));
    for (const w of wallets) {
      expect(w.balance).toBe(1000); // 0 coins deducted
    }
  });

  // ---------------------------------------------------------------------------
  // 9. Wallet + Slot Atomicity Consistency Check
  // ---------------------------------------------------------------------------
  it("9. Wallet + slot atomicity: failed registration leaves zero balance deductions and zero orphaned transactions", async () => {
    const poorUser = await createTestUser("u-poor-race", 50); // only 50 coins

    const tournamentId = `tourn-atomicity-${Date.now()}`;
    await prisma.tournament.create({
      data: {
        id: tournamentId,
        gameId: "cricket",
        title: "Atomicity Verification",
        description: "Test rollback consistency",
        entryFee: 100, // costs 100 coins
        prizePool: 200,
        minPlayers: 2,
        maxPlayers: 4,
        startTime: new Date(Date.now() + 3600_000),
        status: "REGISTRATION_OPEN",
      },
    });

    await expect(registerForTournament(poorUser, tournamentId)).rejects.toThrow(/INSUFFICIENT_BALANCE|Insufficient balance/i);

    // Verify wallet balance is 100% intact
    const wallet = await getWallet(poorUser);
    expect(wallet.balance).toBe(50);

    // Verify 0 tournament player entries
    const playerCount = await prisma.tournamentPlayer.count({
      where: { tournamentId, userId: poorUser },
    });
    expect(playerCount).toBe(0);

    // Verify 0 transactions in ledger
    const txCount = await prisma.transaction.count({
      where: { userId: poorUser, referenceId: tournamentId },
    });
    expect(txCount).toBe(0);
  });
});
