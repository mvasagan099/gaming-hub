import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { GameEntryLifecycleService } from "../gameEntryLifecycleService";
import { registerForTournament } from "../tournaments";
import { WalletTransactionService } from "../walletTransactionService";

describe("Feature 17: Modern Insufficient-Coin Experience", () => {
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
  // 1. Balance = 0 Rejection
  // ---------------------------------------------------------------------------
  it("1. Balance = 0: rejects entry with INSUFFICIENT_BALANCE and zero deductions", async () => {
    const userA = await createTestUser("u-ib-1-a", 0);
    const matchId = `match-ib-1-${Date.now()}`;

    await expect(
      GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 100, matchId })
    ).rejects.toThrow(/Insufficient coins|INSUFFICIENT_BALANCE/i);

    expect((await getWallet(userA)).balance).toBe(0);
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    expect(match).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 2. Balance Below Fee (Partial Balance)
  // ---------------------------------------------------------------------------
  it("2. Balance below fee: 60 balance vs 100 fee rejects with INSUFFICIENT_BALANCE", async () => {
    const userA = await createTestUser("u-ib-2-a", 60);
    const matchId = `match-ib-2-${Date.now()}`;

    await expect(
      GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "carrom", stake: 100, matchId })
    ).rejects.toThrow(/Insufficient coins: You need 100 coins to join \(Balance: 60\)/i);

    expect((await getWallet(userA)).balance).toBe(60);
  });

  // ---------------------------------------------------------------------------
  // 3. Balance Exactly Equal to Entry Fee
  // ---------------------------------------------------------------------------
  it("3. Balance exactly equal: 100 balance vs 100 fee succeeds and leaves 0 balance", async () => {
    const userA = await createTestUser("u-ib-3-a", 100);
    const matchId = `match-ib-3-${Date.now()}`;

    const res = await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 100, matchId });
    expect(res.ok).toBe(true);
    expect((await getWallet(userA)).balance).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 4. Balance Above Fee
  // ---------------------------------------------------------------------------
  it("4. Balance above fee: 250 balance vs 100 fee succeeds and leaves 150 balance", async () => {
    const userA = await createTestUser("u-ib-4-a", 250);
    const matchId = `match-ib-4-${Date.now()}`;

    const res = await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 100, matchId });
    expect(res.ok).toBe(true);
    expect((await getWallet(userA)).balance).toBe(150);
  });

  // ---------------------------------------------------------------------------
  // 5. Tournament Registration Insufficient Balance
  // ---------------------------------------------------------------------------
  it("5. Tournament registration: rejects with INSUFFICIENT_BALANCE and creates 0 registrations", async () => {
    const userA = await createTestUser("u-ib-5-a", 200);
    const tournamentId = `tourn-ib-5-${Date.now()}`;
    createdTournamentIds.push(tournamentId);

    await prisma.tournament.create({
      data: {
        id: tournamentId,
        title: "High Roller Cup",
        description: "500 entry tournament",
        gameId: "chess",
        entryFee: 500,
        prizePool: 4000,
        status: "REGISTRATION_OPEN",
        startTime: new Date(Date.now() + 3600000),
      },
    });

    await expect(
      registerForTournament(userA, tournamentId)
    ).rejects.toThrow(/Insufficient balance|INSUFFICIENT_BALANCE|Insufficient coins/i);

    expect((await getWallet(userA)).balance).toBe(200);
    const regCount = await prisma.tournamentPlayer.count({ where: { tournamentId } });
    expect(regCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 6. Retry After Getting Coins
  // ---------------------------------------------------------------------------
  it("6. Retry flow: after funding wallet, subsequent entry succeeds", async () => {
    const userA = await createTestUser("u-ib-6-a", 50);
    const matchId = `match-ib-6-${Date.now()}`;

    // Initial failure
    await expect(
      GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "table-tennis", stake: 100, matchId })
    ).rejects.toThrow(/Insufficient coins/i);

    // User adds 100 coins via credit
    await WalletTransactionService.createCredit(prisma, {
      userId: userA,
      amount: 100,
      referenceType: "BONUS",
      referenceId: "daily-bonus",
    });

    expect((await getWallet(userA)).balance).toBe(150);

    // Retry entry
    const res = await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "table-tennis", stake: 100, matchId });
    expect(res.ok).toBe(true);
    expect((await getWallet(userA)).balance).toBe(50);
  });
});
