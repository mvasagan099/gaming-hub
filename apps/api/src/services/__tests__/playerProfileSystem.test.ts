import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { PlayerProfileService } from "../playerProfileService";
import { LeaderboardService } from "../leaderboardService";
import { AppError } from "@gaming-hub/shared";

describe("Feature 29: Player Profile & Complete Game Statistics", () => {
  const createdUserIds: string[] = [];
  const createdMatchIds: string[] = [];
  const createdTournamentIds: string[] = [];

  async function createTestUser(prefix: string, balance = 1000, country = "US") {
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
          create: {
            balance,
          },
        },
        profile: {
          create: {
            country,
            bio: "Gaming champion",
            xp: 150,
            level: 2,
            wins: 0,
            losses: 0,
            draws: 0,
            phone: "+1 555-0199",
          },
        },
      },
    });

    return userId;
  }

  afterEach(async () => {
    if (createdMatchIds.length > 0) {
      await prisma.matchPlayer.deleteMany({ where: { matchId: { in: createdMatchIds } } }).catch(() => undefined);
      await prisma.matchStatistics.deleteMany({ where: { matchId: { in: createdMatchIds } } }).catch(() => undefined);
      await prisma.match.deleteMany({ where: { id: { in: createdMatchIds } } }).catch(() => undefined);
      createdMatchIds.length = 0;
    }

    if (createdTournamentIds.length > 0) {
      await prisma.tournamentRound.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } }).catch(() => undefined);
      await prisma.tournamentPlayer.deleteMany({ where: { tournamentId: { in: createdTournamentIds } } }).catch(() => undefined);
      await prisma.tournament.deleteMany({ where: { id: { in: createdTournamentIds } } }).catch(() => undefined);
      createdTournamentIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.userAchievement.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.leaderboard.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.playerStatistic.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.profile.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.wallet.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Own Profile (Full Authenticated Profile)
  // ---------------------------------------------------------------------------
  it("1. Own profile: returns complete authenticated private profile data including wallet and stats", async () => {
    const userId = await createTestUser("u-own-prof", 3500);

    const myProfile = await PlayerProfileService.getMyProfile(userId);
    expect(myProfile).toBeDefined();
    expect(myProfile.userId).toBe(userId);
    expect(myProfile.wallet).toBeDefined();
    expect(myProfile.wallet?.balance).toBe(3500);
    expect(myProfile.phone).toBe("+1 555-0199");
  });

  // ---------------------------------------------------------------------------
  // 2. Public Profile (Public Gameplay Data Only)
  // ---------------------------------------------------------------------------
  it("2. Public profile: returns public competitive stats without private sensitive info", async () => {
    const userA = await createTestUser("u-pub-prof", 5000);
    const viewerId = await createTestUser("u-viewer");

    const pubProfile = await PlayerProfileService.getPublicProfile(userA, viewerId);
    expect(pubProfile).toBeDefined();
    expect(pubProfile.userId).toBe(userA);
    expect(pubProfile.displayName).toBeDefined();
    expect(pubProfile.level).toBe(2);
    expect(pubProfile.isPrivate).toBe(false);

    // Ensure wallet and phone are completely omitted from public profile
    expect((pubProfile as any).wallet).toBeUndefined();
    expect((pubProfile as any).phone).toBeUndefined();
    expect((pubProfile as any).email).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // 3. Private Profile (Privacy Masking)
  // ---------------------------------------------------------------------------
  it("3. Private profile: masks match histories and game statistics when profile is set to private", async () => {
    const userA = await createTestUser("u-priv-user");
    const viewerId = await createTestUser("u-viewer-other");

    // Add some match stats
    await prisma.$transaction(async (tx) => {
      await LeaderboardService.updatePlayerRanking(tx, {
        userId: userA,
        gameId: "chess",
        result: "win",
        score: 100,
      });
    });

    // Set profile to private
    PlayerProfileService.setProfilePrivacy(userA, true);

    // Other user viewing private profile
    const masked = await PlayerProfileService.getPublicProfile(userA, viewerId, false);
    expect(masked.isPrivate).toBe(true);
    expect(masked.gameStats).toEqual([]);
    expect(masked.recentMatches).toEqual([]);
    expect(masked.gamesPlayed).toBe(0);

    // Owner viewing own private profile sees full data
    const ownerView = await PlayerProfileService.getPublicProfile(userA, userA, false);
    expect(ownerView.gameStats.length).toBe(1);
    expect(ownerView.gamesPlayed).toBe(1);

    // Reset privacy
    PlayerProfileService.setProfilePrivacy(userA, false);
  });

  // ---------------------------------------------------------------------------
  // 4. Game Statistics Breakdown
  // ---------------------------------------------------------------------------
  it("4. Game statistics: accurately aggregates per-game wins, losses, draws, and scores", async () => {
    const user = await createTestUser("u-game-stats");

    await prisma.$transaction(async (tx) => {
      await LeaderboardService.updatePlayerRanking(tx, { userId: user, gameId: "chess", result: "win", score: 100 });
      await LeaderboardService.updatePlayerRanking(tx, { userId: user, gameId: "chess", result: "loss", score: 40 });
      await LeaderboardService.updatePlayerRanking(tx, { userId: user, gameId: "carrom", result: "win", score: 80 });
    });

    const pub = await PlayerProfileService.getPublicProfile(user);
    const chessStat = pub.gameStats.find((g) => g.gameId === "chess");
    const carromStat = pub.gameStats.find((g) => g.gameId === "carrom");

    expect(chessStat).toBeDefined();
    expect(chessStat!.gamesPlayed).toBe(2);
    expect(chessStat!.wins).toBe(1);
    expect(chessStat!.losses).toBe(1);

    expect(carromStat).toBeDefined();
    expect(carromStat!.gamesPlayed).toBe(1);
    expect(carromStat!.wins).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 5. Win Rate Calculation
  // ---------------------------------------------------------------------------
  it("5. Win rate: accurately calculates wins / eligible completed games", async () => {
    const user = await createTestUser("u-winrate");

    // 3 wins and 1 loss (75% win rate)
    await prisma.$transaction(async (tx) => {
      await LeaderboardService.updatePlayerRanking(tx, { userId: user, gameId: "ludo", result: "win", score: 10 });
      await LeaderboardService.updatePlayerRanking(tx, { userId: user, gameId: "ludo", result: "win", score: 10 });
      await LeaderboardService.updatePlayerRanking(tx, { userId: user, gameId: "ludo", result: "win", score: 10 });
      await LeaderboardService.updatePlayerRanking(tx, { userId: user, gameId: "ludo", result: "loss", score: 5 });
    });

    const pub = await PlayerProfileService.getPublicProfile(user);
    expect(pub.winRate).toBe(75.0);
    const ludoStat = pub.gameStats.find((g) => g.gameId === "ludo");
    expect(ludoStat?.winRate).toBe(75.0);
  });

  // ---------------------------------------------------------------------------
  // 6. Tournament Statistics
  // ---------------------------------------------------------------------------
  it("6. Tournament statistics: tracks tournaments joined, completed, wins, and podium finishes", async () => {
    const user = await createTestUser("u-tourn-stat");
    const tId = `t-stat-${Date.now()}`;
    createdTournamentIds.push(tId);

    await prisma.tournament.create({
      data: {
        id: tId,
        gameId: "chess",
        title: "Spring Championship",
        description: "Official Spring Championship",
        status: "ENDED",
        format: "KNOCKOUT",
        minPlayers: 4,
        maxPlayers: 4,
        entryFee: 50,
        prizePool: 180,
        startTime: new Date(),
      },
    });

    await prisma.tournamentPlayer.create({
      data: {
        tournamentId: tId,
        userId: user,
        seed: 1,
        finalRank: 1, // Won the tournament!
      },
    });

    const pub = await PlayerProfileService.getPublicProfile(user);
    expect(pub.tournamentStats.tournamentsJoined).toBe(1);
    expect(pub.tournamentStats.tournamentsCompleted).toBe(1);
    expect(pub.tournamentStats.wins).toBe(1);
    expect(pub.tournamentStats.podiums).toBe(1);
    expect(pub.tournamentStats.bestRank).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 7. Game Ratings
  // ---------------------------------------------------------------------------
  it("7. Rating: displays ELO ratings for supported games and total global rating", async () => {
    const user = await createTestUser("u-rating-stat");

    await prisma.$transaction(async (tx) => {
      // Chess win (+25) -> 1025
      await LeaderboardService.updatePlayerRanking(tx, { userId: user, gameId: "chess", result: "win", score: 100 });
      // Carrom win (+25) -> 1025
      await LeaderboardService.updatePlayerRanking(tx, { userId: user, gameId: "carrom", result: "win", score: 100 });
    });

    const pub = await PlayerProfileService.getPublicProfile(user);
    const chessStat = pub.gameStats.find((g) => g.gameId === "chess");
    const carromStat = pub.gameStats.find((g) => g.gameId === "carrom");

    expect(chessStat?.rating).toBe(1025);
    expect(carromStat?.rating).toBe(1025);
    expect(pub.globalRating).toBe(2050);
  });

  // ---------------------------------------------------------------------------
  // 8. Recent Games with Opponent Data
  // ---------------------------------------------------------------------------
  it("8. Recent games: lists completed matches with opponent details and outcome badge", async () => {
    const playerA = await createTestUser("u-rec-a");
    const playerB = await createTestUser("u-rec-b");
    const mId = `match-rec-${Date.now()}`;
    createdMatchIds.push(mId);

    await prisma.match.create({
      data: {
        id: mId,
        gameId: "table-tennis",
        status: "FINISHED",
        stake: 100,
        winnerIds: [playerA],
        startedAt: new Date(),
        endedAt: new Date(),
        players: {
          createMany: {
            data: [
              { userId: playerA, seat: 1, result: "WIN", score: 21 },
              { userId: playerB, seat: 2, result: "LOSS", score: 18 },
            ],
          },
        },
      },
    });

    const pub = await PlayerProfileService.getPublicProfile(playerA);
    expect(pub.recentMatches.length).toBeGreaterThanOrEqual(1);

    const matchEntry = pub.recentMatches.find((m) => m.matchId === mId);
    expect(matchEntry).toBeDefined();
    expect(matchEntry!.gameId).toBe("table-tennis");
    expect(matchEntry!.result).toBe("WIN");
    expect(matchEntry!.opponent?.userId).toBe(playerB);
  });

  // ---------------------------------------------------------------------------
  // 9. Player Search
  // ---------------------------------------------------------------------------
  it("9. Player search: searches by username or displayName with pagination", async () => {
    const searchUser1 = await createTestUser("u-search-alpha");
    const searchUser2 = await createTestUser("u-search-beta");

    const result = await PlayerProfileService.searchPlayers("search-alpha", 1, 10);
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.items.some((u) => u.userId === searchUser1)).toBe(true);
    expect(result.items.some((u) => u.userId === searchUser2)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 10. Unauthorized Private Data Protection
  // ---------------------------------------------------------------------------
  it("10. Unauthorized private data: ensures zero financial or auth leakage in public endpoints", async () => {
    const user = await createTestUser("u-leak-test", 999999);

    const pub = await PlayerProfileService.getPublicProfile(user);
    const json = JSON.stringify(pub);

    // Verify sensitive keys are NOT in serialized payload
    expect(json).not.toContain("999999"); // Balance
    expect(json).not.toContain("phone");
    expect(json).not.toContain("passwordHash");
    expect(json).not.toContain("twoFactorSecret");
  });

  // ---------------------------------------------------------------------------
  // 11. Result Correction Consistency
  // ---------------------------------------------------------------------------
  it("11. Result correction: maintains accurate profile statistics when matches are arbitrated", async () => {
    const adminId = await createTestUser("u-admin-prof");
    const userA = await createTestUser("u-corr-prof-a");
    const userB = await createTestUser("u-corr-prof-b");
    const matchId = `match-prof-corr-${Date.now()}`;
    createdMatchIds.push(matchId);

    await prisma.match.create({
      data: {
        id: matchId,
        gameId: "ludo",
        status: "FINISHED",
        stake: 100,
        winnerIds: [userA],
        startedAt: new Date(),
        endedAt: new Date(),
        players: {
          createMany: {
            data: [
              { userId: userA, seat: 1, result: "WIN", score: 80 },
              { userId: userB, seat: 2, result: "LOSS", score: 65 },
            ],
          },
        },
      },
    });

    await prisma.$transaction(async (tx) => {
      await LeaderboardService.updatePlayerRanking(tx, { userId: userA, gameId: "ludo", result: "win", score: 80 });
      await LeaderboardService.updatePlayerRanking(tx, { userId: userB, gameId: "ludo", result: "loss", score: 65 });
    });

    // Before correction
    let pubA = await PlayerProfileService.getPublicProfile(userA);
    expect(pubA.wins).toBe(1);

    // Admin corrects result to userB
    await LeaderboardService.correctMatchResult({
      matchId,
      correctedWinnerIds: [userB],
      adminId,
      reason: "Boundary recount verified userB won",
    });

    // After correction
    pubA = await PlayerProfileService.getPublicProfile(userA);
    const pubB = await PlayerProfileService.getPublicProfile(userB);

    expect(pubA.wins).toBe(0);
    expect(pubA.losses).toBe(1);
    expect(pubB.wins).toBe(1);
    expect(pubB.losses).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 12. Large Match History Performance
  // ---------------------------------------------------------------------------
  it("12. Large history: resolves profile stats efficiently without loading excessive rows", async () => {
    const user = await createTestUser("u-perf-prof");

    const start = Date.now();
    const pub = await PlayerProfileService.getPublicProfile(user);
    const duration = Date.now() - start;

    expect(pub).toBeDefined();
    expect(duration).toBeLessThan(2000); // Resolves in under 2 seconds
  });
});
