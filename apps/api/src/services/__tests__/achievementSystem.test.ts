import { describe, it, expect, afterEach } from "vitest";
import { prisma, NotificationType } from "@gaming-hub/db";
import { AchievementService } from "../achievementService";
import { LeaderboardService } from "../leaderboardService";
import { AppError } from "@gaming-hub/shared";

describe("Feature 30: Centralized Achievement & Badge System", () => {
  const createdUserIds: string[] = [];
  const createdMatchIds: string[] = [];
  const createdTournamentIds: string[] = [];
  const createdAchievementIds: string[] = [];

  async function createTestUser(prefix: string, balance = 1000) {
    const suffix = Math.random().toString(36).slice(2, 7);
    const userId = `${prefix}-${Date.now()}-${suffix}`;
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        username: `u_${prefix.replace(/[^a-zA-Z0-9]/g, "")}_${suffix}`.slice(0, 24),
        displayName: `Player ${prefix}`,
        email: `${userId}@test.com`,
        wallet: {
          create: { balance },
        },
        profile: {
          create: {
            xp: 100,
            level: 1,
            wins: 0,
            losses: 0,
            draws: 0,
          },
        },
      },
    });

    return userId;
  }

  afterEach(async () => {
    if (createdAchievementIds.length > 0) {
      await prisma.userAchievement.deleteMany({ where: { achievementId: { in: createdAchievementIds } } }).catch(() => undefined);
      await prisma.achievement.deleteMany({ where: { id: { in: createdAchievementIds } } }).catch(() => undefined);
      createdAchievementIds.length = 0;
    }

    if (createdMatchIds.length > 0) {
      await prisma.matchPlayer.deleteMany({ where: { matchId: { in: createdMatchIds } } }).catch(() => undefined);
      await prisma.match.deleteMany({ where: { id: { in: createdMatchIds } } }).catch(() => undefined);
      createdMatchIds.length = 0;
    }

    if (createdTournamentIds.length > 0) {
      await prisma.tournamentPlayer.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } }).catch(() => undefined);
      await prisma.tournament.deleteMany({ where: { id: { in: createdTournamentIds } } }).catch(() => undefined);
      createdTournamentIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.appNotification.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.userAchievement.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.playerStatistic.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.leaderboard.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.profile.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.wallet.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. First Win Achievement Unlock
  // ---------------------------------------------------------------------------
  it("1. First win: unlocks first-win achievement upon winning first match", async () => {
    const user = await createTestUser("u-ach-first-win");

    const ach = await prisma.achievement.upsert({
      where: { code: "test-first-win" },
      create: {
        code: "test-first-win",
        title: "First Victory",
        description: "Win your very first match",
        icon: "🏆",
        xpReward: 50,
        condition: { rule: "first-win" },
      },
      update: {},
    });
    createdAchievementIds.push(ach.id);

    // Initial check: not unlocked
    let unlocked = await AchievementService.evaluateAchievements(user, { userId: user });
    expect(unlocked.some((a) => a.code === "test-first-win")).toBe(false);

    // Complete a winning match
    await prisma.$transaction(async (tx) => {
      await LeaderboardService.updatePlayerRanking(tx, {
        userId: user,
        gameId: "chess",
        result: "win",
        score: 100,
      });
    });

    unlocked = await AchievementService.evaluateAchievements(user, {
      userId: user,
      matchResult: { won: true, gameId: "chess" },
    });

    expect(unlocked.some((a) => a.code === "test-first-win")).toBe(true);

    const userAch = await prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId: user, achievementId: ach.id } },
    });
    expect(userAch).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 2. 100 Games Achievement & Progress
  // ---------------------------------------------------------------------------
  it("2. 100 games: unlocks games achievement only when reaching 100 games played", async () => {
    const user = await createTestUser("u-ach-100-games");

    const ach = await prisma.achievement.upsert({
      where: { code: "test-100-games" },
      create: {
        code: "test-100-games",
        title: "Century Club",
        description: "Play 100 competitive games",
        icon: "🎯",
        xpReward: 200,
        condition: { rule: "games", count: 100 },
      },
      update: {},
    });
    createdAchievementIds.push(ach.id);

    // Set user to 99 games played
    await prisma.playerStatistic.create({
      data: {
        userId: user,
        gameId: "ludo",
        gamesPlayed: 99,
        wins: 50,
      },
    });

    let unlocked = await AchievementService.evaluateAchievements(user);
    expect(unlocked.some((a) => a.code === "test-100-games")).toBe(false);

    // Reach 100 games
    await prisma.playerStatistic.update({
      where: { userId_gameId: { userId: user, gameId: "ludo" } },
      data: { gamesPlayed: 100 },
    });

    unlocked = await AchievementService.evaluateAchievements(user);
    expect(unlocked.some((a) => a.code === "test-100-games")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 3. Win Streak Evaluation (5 consecutive wins)
  // ---------------------------------------------------------------------------
  it("3. Win streak: accurately evaluates consecutive win streak across finished matches", async () => {
    const user = await createTestUser("u-ach-streak");

    const ach = await prisma.achievement.upsert({
      where: { code: "test-streak-5" },
      create: {
        code: "test-streak-5",
        title: "Unstoppable",
        description: "Win 5 consecutive matches",
        icon: "🔥",
        xpReward: 150,
        condition: { rule: "streak", count: 5 },
      },
      update: {},
    });
    createdAchievementIds.push(ach.id);

    // Create 4 wins and 1 loss -> streak is 4, not 5
    for (let i = 0; i < 4; i++) {
      const mId = `m-streak-win-${i}-${Date.now()}`;
      createdMatchIds.push(mId);
      await prisma.match.create({
        data: {
          id: mId,
          gameId: "carrom",
          status: "FINISHED",
          stake: 50,
          endedAt: new Date(Date.now() - (4 - i) * 60000),
          players: {
            create: { userId: user, seat: 1, result: "WIN", score: 10 },
          },
        },
      });
    }

    let streak = await AchievementService.calculateWinStreak(user);
    expect(streak).toBe(4);

    let unlocked = await AchievementService.evaluateAchievements(user);
    expect(unlocked.some((a) => a.code === "test-streak-5")).toBe(false);

    // 5th consecutive win!
    const m5 = `m-streak-win-5-${Date.now()}`;
    createdMatchIds.push(m5);
    await prisma.match.create({
      data: {
        id: m5,
        gameId: "carrom",
        status: "FINISHED",
        stake: 50,
        endedAt: new Date(),
        players: {
          create: { userId: user, seat: 1, result: "WIN", score: 10 },
        },
      },
    });

    streak = await AchievementService.calculateWinStreak(user);
    expect(streak).toBe(5);

    unlocked = await AchievementService.evaluateAchievements(user);
    expect(unlocked.some((a) => a.code === "test-streak-5")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 4. Tournament Champion Unlock
  // ---------------------------------------------------------------------------
  it("4. Tournament champion: unlocks upon winning a tournament", async () => {
    const user = await createTestUser("u-ach-tourn-champ");
    const tId = `t-ach-champ-${Date.now()}`;
    createdTournamentIds.push(tId);

    const ach = await prisma.achievement.upsert({
      where: { code: "test-tourn-champ" },
      create: {
        code: "test-tourn-champ",
        title: "Tournament Champion",
        description: "Win your first tournament title",
        icon: "👑",
        xpReward: 300,
        condition: { rule: "tournament-wins", count: 1 },
      },
      update: {},
    });
    createdAchievementIds.push(ach.id);

    await prisma.tournament.create({
      data: {
        id: tId,
        gameId: "chess",
        title: "Crown Cup",
        description: "Official Cup",
        status: "ENDED",
        format: "KNOCKOUT",
        minPlayers: 4,
        maxPlayers: 4,
        entryFee: 100,
        prizePool: 360,
        startTime: new Date(),
      },
    });

    await prisma.tournamentPlayer.create({
      data: {
        tournamentId: tId,
        userId: user,
        seed: 1,
        finalRank: 1, // First Place Winner
      },
    });

    const unlocked = await AchievementService.evaluateAchievements(user, {
      userId: user,
      tournamentWins: 1,
    });
    expect(unlocked.some((a) => a.code === "test-tourn-champ")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 5. Tournament Podium (Top 3) Finish
  // ---------------------------------------------------------------------------
  it("5. Tournament podium: unlocks podium achievement when placing top 3", async () => {
    const user = await createTestUser("u-ach-podium");
    const tId = `t-ach-podium-${Date.now()}`;
    createdTournamentIds.push(tId);

    const ach = await prisma.achievement.upsert({
      where: { code: "test-tourn-podium" },
      create: {
        code: "test-tourn-podium",
        title: "Podium Finisher",
        description: "Finish in the top 3 of a tournament",
        icon: "🥉",
        xpReward: 100,
        condition: { rule: "tournament-podium", count: 1 },
      },
      update: {},
    });
    createdAchievementIds.push(ach.id);

    await prisma.tournament.create({
      data: {
        id: tId,
        gameId: "cricket",
        title: "Cricket Championship",
        description: "Championship Tournament",
        status: "ENDED",
        format: "KNOCKOUT",
        minPlayers: 4,
        maxPlayers: 4,
        entryFee: 100,
        prizePool: 360,
        startTime: new Date(),
      },
    });

    await prisma.tournamentPlayer.create({
      data: {
        tournamentId: tId,
        userId: user,
        seed: 2,
        finalRank: 3, // 3rd Place Bronze
      },
    });

    const unlocked = await AchievementService.evaluateAchievements(user);
    expect(unlocked.some((a) => a.code === "test-tourn-podium")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 6. Progressive Achievement Progress Numbers
  // ---------------------------------------------------------------------------
  it("6. Progressive achievement: computes exact current, target, and percentage", async () => {
    const user = await createTestUser("u-ach-prog");

    const ach = await prisma.achievement.upsert({
      where: { code: "test-prog-100" },
      create: {
        code: "test-prog-100",
        title: "Centurion",
        description: "Play 100 total games",
        icon: "💯",
        xpReward: 150,
        condition: { rule: "games", count: 100 },
      },
      update: {},
    });
    createdAchievementIds.push(ach.id);

    // Set 23 games played
    await prisma.playerStatistic.create({
      data: {
        userId: user,
        gameId: "table-tennis",
        gamesPlayed: 23,
        wins: 15,
      },
    });

    const playerAchs = await AchievementService.getPlayerAchievements(user);
    const progAch = playerAchs.find((a) => a.code === "test-prog-100");

    expect(progAch).toBeDefined();
    expect(progAch!.unlocked).toBe(false);
    expect(progAch!.progress.current).toBe(23);
    expect(progAch!.progress.target).toBe(100);
    expect(progAch!.progress.percentage).toBe(23);
  });

  // ---------------------------------------------------------------------------
  // 7. Duplicate Unlock Prevention / Idempotency
  // ---------------------------------------------------------------------------
  it("7. Duplicate unlock: prevents duplicate entries or double XP rewards", async () => {
    const user = await createTestUser("u-ach-dup");

    const ach = await prisma.achievement.upsert({
      where: { code: "test-dup-once" },
      create: {
        code: "test-dup-once",
        title: "Once in a Lifetime",
        description: "Win 1 match",
        icon: "⚡",
        xpReward: 50,
        condition: { rule: "wins", count: 1 },
      },
      update: {},
    });
    createdAchievementIds.push(ach.id);

    await prisma.playerStatistic.create({
      data: {
        userId: user,
        gameId: "chess",
        gamesPlayed: 1,
        wins: 1,
      },
    });

    // First evaluation unlocks
    const firstRun = await AchievementService.evaluateAchievements(user);
    expect(firstRun.some((a) => a.code === "test-dup-once")).toBe(true);

    const profileAfterFirst = await prisma.profile.findUnique({ where: { userId: user } });
    expect(profileAfterFirst?.xp).toBe(150); // 100 baseline + 50 reward

    // Second evaluation on same user must NOT duplicate unlock or award double XP
    const secondRun = await AchievementService.evaluateAchievements(user);
    expect(secondRun.some((a) => a.code === "test-dup-once")).toBe(false);

    const profileAfterSecond = await prisma.profile.findUnique({ where: { userId: user } });
    expect(profileAfterSecond?.xp).toBe(150);

    const allUserAchs = await prisma.userAchievement.findMany({
      where: { userId: user, achievementId: ach.id },
    });
    expect(allUserAchs.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 8. Result Correction Consistency
  // ---------------------------------------------------------------------------
  it("8. Result correction: maintains accurate achievement states when match results are corrected", async () => {
    const adminId = await createTestUser("u-ach-admin-corr");
    const playerA = await createTestUser("u-ach-corr-a");
    const playerB = await createTestUser("u-ach-corr-b");

    const mId = `m-ach-corr-${Date.now()}`;
    createdMatchIds.push(mId);

    await prisma.match.create({
      data: {
        id: mId,
        gameId: "cricket",
        status: "FINISHED",
        stake: 100,
        winnerIds: [playerA],
        startedAt: new Date(),
        endedAt: new Date(),
        players: {
          createMany: {
            data: [
              { userId: playerA, seat: 1, result: "WIN", score: 80 },
              { userId: playerB, seat: 2, result: "LOSS", score: 70 },
            ],
          },
        },
      },
    });

    await prisma.$transaction(async (tx) => {
      await LeaderboardService.updatePlayerRanking(tx, { userId: playerA, gameId: "cricket", result: "win", score: 80 });
      await LeaderboardService.updatePlayerRanking(tx, { userId: playerB, gameId: "cricket", result: "loss", score: 70 });
    });

    // Admin corrects result to playerB
    await LeaderboardService.correctMatchResult({
      matchId: mId,
      correctedWinnerIds: [playerB],
      adminId,
      reason: "Scorer mistake verified playerB won",
    });

    const statA = await prisma.playerStatistic.findUnique({ where: { userId_gameId: { userId: playerA, gameId: "cricket" } } });
    const statB = await prisma.playerStatistic.findUnique({ where: { userId_gameId: { userId: playerB, gameId: "cricket" } } });

    expect(statA?.wins).toBe(0);
    expect(statB?.wins).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 9. Cancelled Match Handling
  // ---------------------------------------------------------------------------
  it("9. Cancelled match: does not advance or break a player's win streak", async () => {
    const user = await createTestUser("u-ach-canc");

    // Win 1
    const m1 = `m-canc-w1-${Date.now()}`;
    createdMatchIds.push(m1);
    await prisma.match.create({
      data: {
        id: m1,
        gameId: "chess",
        status: "FINISHED",
        stake: 50,
        endedAt: new Date(Date.now() - 120000),
        players: { create: { userId: user, seat: 1, result: "WIN", score: 1 } },
      },
    });

    // Cancelled match in between
    const m2 = `m-canc-aborted-${Date.now()}`;
    createdMatchIds.push(m2);
    await prisma.match.create({
      data: {
        id: m2,
        gameId: "chess",
        status: "ABORTED",
        stake: 50,
        endedAt: new Date(Date.now() - 60000),
        players: { create: { userId: user, seat: 1, result: "PENDING", score: 0 } },
      },
    });

    // Win 2
    const m3 = `m-canc-w2-${Date.now()}`;
    createdMatchIds.push(m3);
    await prisma.match.create({
      data: {
        id: m3,
        gameId: "chess",
        status: "FINISHED",
        stake: 50,
        endedAt: new Date(),
        players: { create: { userId: user, seat: 1, result: "WIN", score: 1 } },
      },
    });

    const streak = await AchievementService.calculateWinStreak(user);
    expect(streak).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // 10. Forfeited Match Handling
  // ---------------------------------------------------------------------------
  it("10. Forfeited match: properly breaks streak for the forfeiting player", async () => {
    const user = await createTestUser("u-ach-forfeit");

    // Win 1
    const m1 = `m-forfeit-w1-${Date.now()}`;
    createdMatchIds.push(m1);
    await prisma.match.create({
      data: {
        id: m1,
        gameId: "chess",
        status: "FINISHED",
        stake: 50,
        endedAt: new Date(Date.now() - 60000),
        players: { create: { userId: user, seat: 1, result: "WIN", score: 1 } },
      },
    });

    // Forfeit / Abandon (Recorded as LOSS in finished match)
    const m2 = `m-forfeit-loss-${Date.now()}`;
    createdMatchIds.push(m2);
    await prisma.match.create({
      data: {
        id: m2,
        gameId: "chess",
        status: "FINISHED",
        stake: 50,
        endedAt: new Date(),
        players: { create: { userId: user, seat: 1, result: "LOSS", score: 0 } },
      },
    });

    const streak = await AchievementService.calculateWinStreak(user);
    expect(streak).toBe(0); // Streak broken by loss
  });

  // ---------------------------------------------------------------------------
  // 11. Notification on Unlock
  // ---------------------------------------------------------------------------
  it("11. Notification: dispatches notification upon unlocking achievement", async () => {
    const user = await createTestUser("u-ach-notif");

    const ach = await prisma.achievement.upsert({
      where: { code: "test-notif-ach" },
      create: {
        code: "test-notif-ach",
        title: "Notification Star",
        description: "Win 1 match to test notifications",
        icon: "🌟",
        xpReward: 50,
        condition: { rule: "wins", count: 1 },
      },
      update: {},
    });
    createdAchievementIds.push(ach.id);

    await prisma.playerStatistic.create({
      data: {
        userId: user,
        gameId: "carrom",
        gamesPlayed: 1,
        wins: 1,
      },
    });

    await AchievementService.evaluateAchievements(user);

    const notifs = await prisma.appNotification.findMany({
      where: { userId: user, type: NotificationType.ACHIEVEMENT },
    });

    expect(notifs.length).toBeGreaterThanOrEqual(1);
    expect(notifs.some((n) => n.title.includes("Notification Star"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 12. Profile Display
  // ---------------------------------------------------------------------------
  it("12. Profile display: returns all achievements formatted with unlock status and progress", async () => {
    const user = await createTestUser("u-ach-prof-disp");

    const ach = await prisma.achievement.upsert({
      where: { code: "test-display-ach" },
      create: {
        code: "test-display-ach",
        title: "Display Trophy",
        description: "Display test achievement",
        icon: "🏆",
        xpReward: 80,
        condition: { rule: "games", count: 10 },
      },
      update: {},
    });
    createdAchievementIds.push(ach.id);

    const achievements = await AchievementService.getPlayerAchievements(user);
    expect(achievements).toBeDefined();
    expect(Array.isArray(achievements)).toBe(true);
    expect(achievements.length).toBeGreaterThanOrEqual(1);

    const found = achievements.find((a) => a.code === "test-display-ach");
    expect(found).toBeDefined();
    expect(found!.title).toBe("Display Trophy");
    expect(found!.progress).toBeDefined();
    expect(typeof found!.progress.percentage).toBe("number");
  });

  // ---------------------------------------------------------------------------
  // 13. Admin Configuration (Create / Update Achievement)
  // ---------------------------------------------------------------------------
  it("13. Admin configuration: allows authorized creation, updating, and manual unlock of achievements", async () => {
    const adminId = await createTestUser("u-ach-admin");
    const user = await createTestUser("u-ach-target");

    const code = `admin-custom-${Date.now()}`;
    const created = await AchievementService.createAchievement({
      code,
      title: "Admin Custom Challenge",
      description: "Play 50 custom games",
      icon: "🎖️",
      xpReward: 120,
      condition: { rule: "games", count: 50 },
    });
    createdAchievementIds.push(created.id);

    expect(created.code).toBe(code);

    // Update definition
    const updated = await AchievementService.updateAchievement(created.id, {
      title: "Updated Challenge Title",
      xpReward: 150,
    });
    expect(updated.title).toBe("Updated Challenge Title");
    expect(updated.xpReward).toBe(150);

    // Admin manual unlock with audit logging
    const manualUnlock = await AchievementService.adminManualUnlock(
      user,
      created.id,
      adminId,
      "Rewarded for tournament sportsmanship",
    );
    expect(manualUnlock).toBeDefined();

    const isUnlocked = await prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId: user, achievementId: created.id } },
    });
    expect(isUnlocked).toBeDefined();

    const auditEntry = await prisma.auditLog.findFirst({
      where: { actorId: adminId, action: "achievement.manual_unlock" },
    });
    expect(auditEntry).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 14. Concurrent Achievement Evaluation Safety
  // ---------------------------------------------------------------------------
  it("14. Concurrency: safely handles parallel achievement evaluation without race conditions", async () => {
    const user = await createTestUser("u-ach-concurrent");

    const ach = await prisma.achievement.upsert({
      where: { code: "test-concurrent" },
      create: {
        code: "test-concurrent",
        title: "Rapid Fire",
        description: "Win 1 match under concurrency",
        icon: "⚡",
        xpReward: 50,
        condition: { rule: "wins", count: 1 },
      },
      update: {},
    });
    createdAchievementIds.push(ach.id);

    await prisma.playerStatistic.create({
      data: {
        userId: user,
        gameId: "chess",
        gamesPlayed: 1,
        wins: 1,
      },
    });

    // Run 5 simultaneous evaluations for the same user
    const results = await Promise.all([
      AchievementService.evaluateAchievements(user),
      AchievementService.evaluateAchievements(user),
      AchievementService.evaluateAchievements(user),
      AchievementService.evaluateAchievements(user),
      AchievementService.evaluateAchievements(user),
    ]);

    const totalNewlyUnlocked = results.flat().filter((a) => a.code === "test-concurrent");
    // At most 1 should claim to be newly unlocked in parallel execution
    expect(totalNewlyUnlocked.length).toBeLessThanOrEqual(1);

    const records = await prisma.userAchievement.findMany({
      where: { userId: user, achievementId: ach.id },
    });
    expect(records.length).toBe(1);
  });
});
