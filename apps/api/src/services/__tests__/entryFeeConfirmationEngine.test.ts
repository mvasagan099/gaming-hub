import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { GameEntryLifecycleService } from "../gameEntryLifecycleService";
import { registerForTournament } from "../tournaments";

describe("Feature 18: Secure Entry Fee Confirmation", () => {
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

  async function getWallet(userId: string) {
    return prisma.wallet.findUniqueOrThrow({ where: { userId } });
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
  // 1. Paid Game Confirmation
  // ---------------------------------------------------------------------------
  it("1. Paid game confirmation: matching expectedFee succeeds and debits coins", async () => {
    const userA = await createTestUser("u-efc-1-a", 1000);
    const matchId = `match-efc-1-${Date.now()}`;

    const res = await GameEntryLifecycleService.initiateEntry({
      userId: userA,
      gameId: "chess",
      stake: 100,
      expectedFee: 100,
      matchId,
    });

    expect(res.ok).toBe(true);
    expect(res.fee).toBe(100);
    expect((await getWallet(userA)).balance).toBe(900);
  });

  // ---------------------------------------------------------------------------
  // 2. Free Game Entry
  // ---------------------------------------------------------------------------
  it("2. Free game entry: stake = 0 succeeds directly with 0 balance deduction", async () => {
    const userA = await createTestUser("u-efc-2-a", 500);
    const matchId = `match-efc-2-${Date.now()}`;

    const res = await GameEntryLifecycleService.initiateEntry({
      userId: userA,
      gameId: "chess",
      stake: 0,
      matchId,
    });

    expect(res.ok).toBe(true);
    expect(res.fee).toBe(0);
    expect((await getWallet(userA)).balance).toBe(500);
  });

  // ---------------------------------------------------------------------------
  // 3. Changed Entry Fee Detection (Game)
  // ---------------------------------------------------------------------------
  it("3. Game entry fee changed: rejects with ENTRY_FEE_CHANGED on fee mismatch", async () => {
    const userA = await createTestUser("u-efc-3-a", 1000);
    const matchId = `match-efc-3-${Date.now()}`;

    // Client expects 50, but actual stake is 100
    await expect(
      GameEntryLifecycleService.initiateEntry({
        userId: userA,
        gameId: "chess",
        stake: 100,
        expectedFee: 50,
        matchId,
      })
    ).rejects.toThrow(/ENTRY_FEE_CHANGED|Entry fee has changed/i);

    // Balance remains 1000
    expect((await getWallet(userA)).balance).toBe(1000);
  });

  // ---------------------------------------------------------------------------
  // 4. Tournament Registration Confirmation
  // ---------------------------------------------------------------------------
  it("4. Tournament registration: matching expectedFee registers player and debits fee", async () => {
    const userA = await createTestUser("u-efc-4-a", 1000);
    const tournamentId = `tourn-efc-4-${Date.now()}`;
    createdTournamentIds.push(tournamentId);

    await prisma.tournament.create({
      data: {
        id: tournamentId,
        title: "Spring Cup",
        description: "100 entry tournament",
        gameId: "chess",
        entryFee: 100,
        prizePool: 800,
        status: "REGISTRATION_OPEN",
        startTime: new Date(Date.now() + 3600000),
      },
    });

    const res = await registerForTournament(userA, tournamentId, 100);
    expect(res.ok).toBe(true);
    expect((await getWallet(userA)).balance).toBe(900);
  });

  // ---------------------------------------------------------------------------
  // 5. Changed Entry Fee Detection (Tournament)
  // ---------------------------------------------------------------------------
  it("5. Tournament entry fee changed: rejects with ENTRY_FEE_CHANGED on fee mismatch", async () => {
    const userA = await createTestUser("u-efc-5-a", 1000);
    const tournamentId = `tourn-efc-5-${Date.now()}`;
    createdTournamentIds.push(tournamentId);

    await prisma.tournament.create({
      data: {
        id: tournamentId,
        title: "Summer Slam",
        description: "200 entry tournament",
        gameId: "chess",
        entryFee: 200,
        prizePool: 1600,
        status: "REGISTRATION_OPEN",
        startTime: new Date(Date.now() + 3600000),
      },
    });

    // Client expects 100, but fee is 200
    await expect(
      registerForTournament(userA, tournamentId, 100)
    ).rejects.toThrow(/ENTRY_FEE_CHANGED|Tournament entry fee has changed/i);

    expect((await getWallet(userA)).balance).toBe(1000);
    const regCount = await prisma.tournamentPlayer.count({ where: { tournamentId } });
    expect(regCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 6. Double Confirmation Idempotency
  // ---------------------------------------------------------------------------
  it("6. Double confirmation: concurrent joins debit fee exactly once", async () => {
    const userA = await createTestUser("u-efc-6-a", 1000);
    const matchId = `match-efc-6-${Date.now()}`;

    const [res1, res2] = await Promise.allSettled([
      GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 100, expectedFee: 100, matchId }),
      GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 100, expectedFee: 100, matchId }),
    ]);

    expect((res1.status === "fulfilled" && res1.value.ok) || (res2.status === "fulfilled" && res2.value.ok)).toBe(true);
    expect((await getWallet(userA)).balance).toBe(900); // exactly one 100-coin debit
  });
});
