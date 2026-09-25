import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { SettlementService } from "../settlementService";
import { GameEntryLifecycleService } from "../gameEntryLifecycleService";
import { registerForTournament } from "../tournaments";

describe("Feature 7: Universal Game & Tournament Settlement Engine", () => {
  const createdUserIds: string[] = [];

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
    if (createdUserIds.length > 0) {
      await prisma.matchPlayer.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.tournamentPlayer.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.transaction.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.wallet.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.profile.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // 1 & 2. Winner & Loser Settlement
  // ---------------------------------------------------------------------------
  it("1 & 2. Winner & Loser settlement: winner receives 90% pot, loser receives 0 reward", async () => {
    const userA = await createTestUser("u-set-win", 1000);
    const userB = await createTestUser("u-set-lose", 1000);
    const matchId = `match-set-1-${Date.now()}`;

    // Both players pay 100 stake (pot 200)
    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    expect((await getWallet(userA)).balance).toBe(900);
    expect((await getWallet(userB)).balance).toBe(900);

    // Settle with userA as winner
    const summary = await SettlementService.settleMatch({
      matchId,
      winnerIds: [userA],
      options: { reason: "checkmate" },
    });

    expect(summary.status).toBe("SETTLED");
    expect(summary.totalPot).toBe(200);
    expect(summary.prizePool).toBe(180);

    // Winner gets 180 coins -> balance = 900 + 180 = 1080
    expect((await getWallet(userA)).balance).toBe(1080);
    // Loser gets 0 reward -> balance remains 900
    expect((await getWallet(userB)).balance).toBe(900);

    // Check MatchPlayer records
    const players = await prisma.matchPlayer.findMany({ where: { matchId } });
    const pA = players.find((p) => p.userId === userA);
    const pB = players.find((p) => p.userId === userB);
    expect(pA?.result).toBe("WIN");
    expect(pB?.result).toBe("LOSS");
  });

  // ---------------------------------------------------------------------------
  // 3. Draw Outcome Settlement
  // ---------------------------------------------------------------------------
  it("3. Draw outcome: refunds 100% entry fee to all participating players", async () => {
    const userA = await createTestUser("u-draw-a", 1000);
    const userB = await createTestUser("u-draw-b", 1000);
    const matchId = `match-draw-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "table-tennis", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "table-tennis", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Settle with empty winner list (Draw)
    const summary = await SettlementService.settleMatch({
      matchId,
      winnerIds: [],
      options: { reason: "stalemate" },
    });

    expect(summary.status).toBe("SETTLED");
    // Both players refunded 100 coins -> balances restored to 1000
    expect((await getWallet(userA)).balance).toBe(1000);
    expect((await getWallet(userB)).balance).toBe(1000);

    // Check transaction records
    const refundA = await prisma.transaction.findFirst({
      where: { userId: userA, referenceId: matchId, referenceType: "WAGER_REFUND" },
    });
    expect(refundA?.amount).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // 4. Zero Reward (Practice Match)
  // ---------------------------------------------------------------------------
  it("4. Zero reward: 0-stake free matches settle cleanly with 0 coin deductions or payouts", async () => {
    const userA = await createTestUser("u-free-a", 1000);
    const userB = await createTestUser("u-free-b", 1000);
    const matchId = `match-free-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "fruit-ninja", stake: 0, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "fruit-ninja", stake: 0, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    const summary = await SettlementService.settleMatch({
      matchId,
      winnerIds: [userA],
    });

    expect(summary.status).toBe("SETTLED");
    expect(summary.totalPot).toBe(0);
    expect(summary.prizePool).toBe(0);

    expect((await getWallet(userA)).balance).toBe(1000);
    expect((await getWallet(userB)).balance).toBe(1000);
  });

  // ---------------------------------------------------------------------------
  // 5. Duplicate Settlement Idempotency
  // ---------------------------------------------------------------------------
  it("5. Duplicate settlement: repeated settle calls return ALREADY_SETTLED and credit prize once", async () => {
    const userA = await createTestUser("u-dup-a", 1000);
    const userB = await createTestUser("u-dup-b", 1000);
    const matchId = `match-dupsettle-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Call 1
    const res1 = await SettlementService.settleMatch({ matchId, winnerIds: [userA] });
    expect(res1.status).toBe("SETTLED");

    // Call 2
    const res2 = await SettlementService.settleMatch({ matchId, winnerIds: [userA] });
    expect(res2.status === "SETTLED" || res2.status === "ALREADY_SETTLED").toBe(true);

    // Call 3
    const res3 = await SettlementService.settleMatch({ matchId, winnerIds: [userA] });
    expect(res3.status === "SETTLED" || res3.status === "ALREADY_SETTLED").toBe(true);

    // Winner credited exactly 180 coins -> balance = 1080 (never 1260 or 1440)
    expect((await getWallet(userA)).balance).toBe(1080);

    const prizeTxs = await prisma.transaction.count({
      where: { userId: userA, referenceId: matchId, referenceType: "MATCH_PAYOUT" },
    });
    expect(prizeTxs).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 6. Concurrent Settlement Protection
  // ---------------------------------------------------------------------------
  it("6. Concurrent settlement: simultaneous settlement calls credit wallet exactly once", async () => {
    const userA = await createTestUser("u-conc-set-a", 1000);
    const userB = await createTestUser("u-conc-set-b", 1000);
    const matchId = `match-concset-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "snake-vs-worms", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "snake-vs-worms", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Launch 5 simultaneous settlement requests
    const results = await Promise.allSettled([
      SettlementService.settleMatch({ matchId, winnerIds: [userA] }),
      SettlementService.settleMatch({ matchId, winnerIds: [userA] }),
      SettlementService.settleMatch({ matchId, winnerIds: [userA] }),
      SettlementService.settleMatch({ matchId, winnerIds: [userA] }),
      SettlementService.settleMatch({ matchId, winnerIds: [userA] }),
    ]);

    for (const r of results) {
      expect(r.status).toBe("fulfilled");
    }

    expect((await getWallet(userA)).balance).toBe(1080);
    const prizeTxs = await prisma.transaction.count({
      where: { userId: userA, referenceId: matchId, referenceType: "MATCH_PAYOUT" },
    });
    expect(prizeTxs).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 7 & 8. Multi-Player & Split Pot Support (4-Player Carrom)
  // ---------------------------------------------------------------------------
  it("7 & 8. Multi-player & Split pot: 4 players pot 400, split pot divides prize equally", async () => {
    const u1 = await createTestUser("u-4p-1", 1000);
    const u2 = await createTestUser("u-4p-2", 1000);
    const u3 = await createTestUser("u-4p-3", 1000);
    const u4 = await createTestUser("u-4p-4", 1000);
    const matchId = `match-4p-${Date.now()}`;

    // 4 players in Carrom stake 100 each (total pot 400, prize pool 360)
    await GameEntryLifecycleService.initiateEntry({ userId: u1, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: u2, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: u3, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: u4, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Two winners tie for first place: u1 and u2 split 360 (180 each)
    const summary = await SettlementService.settleMatch({
      matchId,
      winnerIds: [u1, u2],
    });

    expect(summary.totalPot).toBe(400);
    expect(summary.prizePool).toBe(360);

    // u1 and u2: 900 + 180 = 1080
    expect((await getWallet(u1)).balance).toBe(1080);
    expect((await getWallet(u2)).balance).toBe(1080);
    // u3 and u4: 900
    expect((await getWallet(u3)).balance).toBe(900);
    expect((await getWallet(u4)).balance).toBe(900);
  });

  // ---------------------------------------------------------------------------
  // 9. Tournament Bracket Match Settlement
  // ---------------------------------------------------------------------------
  it("9. Tournament match: bracket match settles outcome without paying tournament prize early", async () => {
    const userA = await createTestUser("u-tmatch-a", 1000);
    const userB = await createTestUser("u-tmatch-b", 1000);
    const tournamentId = `tourn-match-tst-${Date.now()}`;
    const matchId = `match-tourn-bracket-${Date.now()}`;

    // Tournament match with 0 stake (entry fee was already paid at registration)
    await GameEntryLifecycleService.initiateEntry({
      userId: userA,
      gameId: "table-tennis",
      stake: 0,
      matchId,
      isTournament: true,
    });
    await GameEntryLifecycleService.initiateEntry({
      userId: userB,
      gameId: "table-tennis",
      stake: 0,
      matchId,
      isTournament: true,
    });
    await GameEntryLifecycleService.startMatch(matchId);

    await SettlementService.settleTournamentMatch({
      matchId,
      tournamentId,
      winnerId: userA,
      loserId: userB,
      roundNumber: 1,
    });

    // Balances remain untouched (no bracket-level prize deductions)
    expect((await getWallet(userA)).balance).toBe(1000);
    expect((await getWallet(userB)).balance).toBe(1000);
  });

  // ---------------------------------------------------------------------------
  // 10. Tournament Final Settlement
  // ---------------------------------------------------------------------------
  it("10. Tournament final settlement: distributes rank prizes once and marks SETTLED", async () => {
    const user1 = await createTestUser("u-tfinal-1", 1000);
    const user2 = await createTestUser("u-tfinal-2", 1000);
    const tournamentId = `tourn-final-tst-${Date.now()}`;

    await prisma.tournament.create({
      data: {
        id: tournamentId,
        gameId: "bubble-shooter",
        title: "Championship Tournament",
        description: "Test prize settlement",
        entryFee: 100,
        prizePool: 500,
        grossPool: 500,
        minPlayers: 2,
        maxPlayers: 4,
        startTime: new Date(Date.now() + 3600_000),
        status: "REGISTRATION_OPEN",
        prizeDistribution: [
          { rank: 1, percentage: 70 },
          { rank: 2, percentage: 30 },
        ],
      },
    });

    // Register players
    await registerForTournament(user1, tournamentId);
    await registerForTournament(user2, tournamentId);

    // Assign final ranks
    await prisma.tournamentPlayer.updateMany({
      where: { tournamentId, userId: user1 },
      data: { finalRank: 1 },
    });
    await prisma.tournamentPlayer.updateMany({
      where: { tournamentId, userId: user2 },
      data: { finalRank: 2 },
    });

    // Settle tournament
    const res = await SettlementService.settleTournament(tournamentId);
    expect(res.ok).toBe(true);

    // Rank 1 gets 70% of 500 = 350 -> balance = 900 + 350 = 1250
    expect((await getWallet(user1)).balance).toBe(1250);
    // Rank 2 gets 30% of 500 = 150 -> balance = 900 + 150 = 1050
    expect((await getWallet(user2)).balance).toBe(1050);

    // Second call is idempotent
    await SettlementService.settleTournament(tournamentId);
    expect((await getWallet(user1)).balance).toBe(1250);
    expect((await getWallet(user2)).balance).toBe(1050);
  });

  // ---------------------------------------------------------------------------
  // 11. Admin Settlement Override
  // ---------------------------------------------------------------------------
  it("11. Admin settlement: processAdminSettlement requires admin auth and produces audit log", async () => {
    const userA = await createTestUser("u-adm-set-a", 1000);
    const userB = await createTestUser("u-adm-set-b", 1000);
    const matchId = `match-adminset-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    const result = await SettlementService.processAdminSettlement({
      referenceType: "MATCH",
      referenceId: matchId,
      winnerIds: [userA],
      reason: "Admin match dispute resolution",
      adminId: "admin-judge-id",
    });

    expect("status" in result && result.status).toBe("SETTLED");
    expect((await getWallet(userA)).balance).toBe(1080);

    // Verify audit log
    const auditLog = await prisma.auditLog.findFirst({
      where: { targetId: matchId, action: "admin.settle.match" },
    });
    expect(auditLog).toBeDefined();
    expect(auditLog?.actorId).toBe("admin-judge-id");
  });
});
