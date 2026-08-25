import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { GameHistoryService } from "../gameHistoryService";
import { GameEntryLifecycleService } from "../gameEntryLifecycleService";
import { SettlementService } from "../settlementService";
import { RefundService } from "../refundService";

describe("Feature 14: Complete User Game History", () => {
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

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Own Game History & Historical Financials
  // ---------------------------------------------------------------------------
  it("1. User game history: returns chronological matches with historical entryFee and payout", async () => {
    const userA = await createTestUser("u-gh-1-a", 1000);
    const userB = await createTestUser("u-gh-1-b", 1000);
    const matchId = `match-gh-1-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // userA wins match
    await SettlementService.settleMatch({
      matchId,
      winnerIds: [userA],
      options: { scores: { [userA]: 11, [userB]: 8 } },
    });

    const history = await GameHistoryService.listUserGameHistory({ userId: userA });
    expect(history.total).toBe(1);
    expect(history.items).toHaveLength(1);

    const item = history.items[0];
    expect(item.matchId).toBe(matchId);
    expect(item.gameId).toBe("chess");
    expect(item.resultType).toBe("WIN");
    expect(item.entryFee).toBe(100);
    expect(item.coinsWon).toBe(180);
    expect(item.netCoins).toBe(80);
    expect(item.opponentId).toBe(userB);
    expect(item.score).toBe(11);
    expect(item.opponentScore).toBe(8);
    expect(item.transactionIds.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // 2. Unauthorized History Access
  // ---------------------------------------------------------------------------
  it("2. User isolation: user cannot inspect a match they did not participate in", async () => {
    const userA = await createTestUser("u-gh-2-a", 1000);
    const userB = await createTestUser("u-gh-2-b", 1000);
    const userC = await createTestUser("u-gh-2-c", 1000);
    const matchId = `match-gh-2-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // userC was not in match -> rejected with 403
    await expect(
      GameHistoryService.getMatchDetails(userC, matchId)
    ).rejects.toThrow(/FORBIDDEN|not a participant/i);
  });

  // ---------------------------------------------------------------------------
  // 3. Filtering by Game and Result
  // ---------------------------------------------------------------------------
  it("3. Filtering: filters by game type and result (WIN, LOSS, CANCELLED)", async () => {
    const userA = await createTestUser("u-gh-3-a", 1000);
    const userB = await createTestUser("u-gh-3-b", 1000);

    const match1 = `m-gh-3-1-${Date.now()}`;
    const match2 = `m-gh-3-2-${Date.now()}`;
    const match3 = `m-gh-3-3-${Date.now()}`;

    // Match 1: Chess - Win
    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 50, matchId: match1 });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "chess", stake: 50, matchId: match1 });
    await GameEntryLifecycleService.startMatch(match1);
    await SettlementService.settleMatch({ matchId: match1, winnerIds: [userA] });

    // Match 2: Carrom - Loss
    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "carrom", stake: 50, matchId: match2 });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "carrom", stake: 50, matchId: match2 });
    await GameEntryLifecycleService.startMatch(match2);
    await SettlementService.settleMatch({ matchId: match2, winnerIds: [userB] });

    // Match 3: Ludo - Cancelled / Refunded
    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "ludo", stake: 50, matchId: match3 });
    await RefundService.refundCancelledMatch({ matchId: match3, reason: "player_left" });

    // Game filter
    const chessOnly = await GameHistoryService.listUserGameHistory({ userId: userA, gameId: "chess" });
    expect(chessOnly.total).toBe(1);
    expect(chessOnly.items[0].gameId).toBe("chess");

    // Result filter
    const winsOnly = await GameHistoryService.listUserGameHistory({ userId: userA, result: "WIN" });
    expect(winsOnly.total).toBe(1);
    expect(winsOnly.items[0].matchId).toBe(match1);

    const lossesOnly = await GameHistoryService.listUserGameHistory({ userId: userA, result: "LOSS" });
    expect(lossesOnly.total).toBe(1);
    expect(lossesOnly.items[0].matchId).toBe(match2);

    const cancelledOnly = await GameHistoryService.listUserGameHistory({ userId: userA, status: "ABORTED" });
    expect(cancelledOnly.total).toBe(1);
    expect(cancelledOnly.items[0].resultType).toBe("CANCELLED");
  });

  // ---------------------------------------------------------------------------
  // 4. Tournament Match Reference
  // ---------------------------------------------------------------------------
  it("4. Tournament reference: embeds tournamentId and roundId for bracket matches", async () => {
    const userA = await createTestUser("u-gh-4-a", 1000);
    const userB = await createTestUser("u-gh-4-b", 1000);
    const matchId = `match-gh-4-${Date.now()}`;
    const tournamentId = `tourn-${Date.now()}`;
    const roundId = "round-1";
    const roomId = `tournament_${tournamentId}:${roundId}`;

    await prisma.room.create({
      data: {
        id: roomId,
        gameId: "chess",
        hostId: userA,
        code: `T${Date.now().toString().slice(-4)}`,
        stake: 0,
        minPlayers: 2,
        maxPlayers: 2,
      },
    });

    await prisma.match.create({
      data: {
        id: matchId,
        gameId: "chess",
        stake: 0,
        status: "FINISHED",
        roomId,
        winnerIds: [userA],
        players: {
          create: [
            { userId: userA, seat: 0, result: "WIN", score: 1 },
            { userId: userB, seat: 1, result: "LOSS", score: 0 },
          ],
        },
      },
    });

    const history = await GameHistoryService.listUserGameHistory({ userId: userA });
    expect(history.items[0]?.tournamentInfo?.isTournament).toBe(true);
    expect(history.items[0]?.tournamentInfo?.tournamentId).toBe(tournamentId);
    expect(history.items[0]?.tournamentInfo?.roundId).toBe(roundId);
  });

  // ---------------------------------------------------------------------------
  // 5. User Game Statistics
  // ---------------------------------------------------------------------------
  it("5. User game statistics: aggregates wins, losses, winRate, and netCoins", async () => {
    const userA = await createTestUser("u-gh-5-a", 1000);
    const userB = await createTestUser("u-gh-5-b", 1000);

    const match1 = `m-gh-5-1-${Date.now()}`;
    const match2 = `m-gh-5-2-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "table-tennis", stake: 100, matchId: match1 });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "table-tennis", stake: 100, matchId: match1 });
    await GameEntryLifecycleService.startMatch(match1);
    await SettlementService.settleMatch({ matchId: match1, winnerIds: [userA] });

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "table-tennis", stake: 100, matchId: match2 });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "table-tennis", stake: 100, matchId: match2 });
    await GameEntryLifecycleService.startMatch(match2);
    await SettlementService.settleMatch({ matchId: match2, winnerIds: [userB] });

    const stats = await GameHistoryService.getUserGameStats(userA, "table-tennis");
    expect(stats.totalMatches).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBe(50);
    expect(stats.netCoins).toBe(80); // +180 won - 100 lost
  });

  // ---------------------------------------------------------------------------
  // 6. Empty State Handling
  // ---------------------------------------------------------------------------
  it("6. Empty state: user with 0 matches returns empty items list cleanly", async () => {
    const userA = await createTestUser("u-gh-6-a", 1000);

    const history = await GameHistoryService.listUserGameHistory({ userId: userA });
    expect(history.items).toEqual([]);
    expect(history.total).toBe(0);
    expect(history.totalPages).toBe(0);
  });
});
