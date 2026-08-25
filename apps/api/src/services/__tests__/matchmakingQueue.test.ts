import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { MatchmakingQueueService } from "../matchmakingQueueService";
import { AppError, type GameId } from "@gaming-hub/shared";

describe("GLOBAL MULTIPLAYER MATCHMAKING QUEUE", () => {
  const createdUserIds: string[] = [];
  const createdMatchIds: string[] = [];

  const ALL_10_GAMES: GameId[] = [
    "snake-ladder",
    "ludo",
    "chess",
    "fruit-ninja",
    "bubble-shooter",
    "table-tennis",
    "snake-vs-worms",
    "cricket",
    "carrom",
    "snooker",
  ];

  async function createTestUser(prefix = "mm_user", initialBalance = 5000) {
    const id = `u_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const username = `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: {
        id,
        username,
        displayName: `Player ${username}`,
        email: `${username}@matchmaking.test`,
        role: "USER",
        profile: {
          create: {
            coins: initialBalance,
          },
        },
        wallet: {
          create: {
            balance: initialBalance,
          },
        },
      },
      include: { profile: true, wallet: true },
    });
    createdUserIds.push(user.id);
    return user;
  }

  afterEach(async () => {
    // Clean up created matches
    if (createdMatchIds.length > 0) {
      await prisma.match.deleteMany({
        where: { id: { in: createdMatchIds } },
      }).catch(() => undefined);
      createdMatchIds.length = 0;
    }

    // Clean up created matchmaking queues and test users
    if (createdUserIds.length > 0) {
      await prisma.matchmakingQueue.deleteMany({
        where: { userId: { in: createdUserIds } },
      }).catch(() => undefined);

      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  describe("1. Matchmaking Entry & Validation", () => {
    it("places authenticated eligible player into the matchmaking queue", async () => {
      const user = await createTestUser("entry_valid", 1000);
      const res = await MatchmakingQueueService.joinQueue({
        userId: user.id,
        gameId: "chess",
        entryFee: 100,
        gameMode: "casual",
      });

      expect(res.queued).toBe(true);
      expect(res.position).toBe(1);
      expect(res.gameId).toBe("chess");
      expect(res.entryFee).toBe(100);
      expect(res.isExisting).toBe(false);

      const inDb = await prisma.matchmakingQueue.findUnique({
        where: { id: res.queueId },
      });
      expect(inDb).not.toBeNull();
      expect(inDb?.status).toBe("WAITING");
      expect(inDb?.userId).toBe(user.id);
    });

    it("rejects non-existent user with UNAUTHORIZED", async () => {
      await expect(
        MatchmakingQueueService.joinQueue({
          userId: "non_existent_user_12345",
          gameId: "chess",
          entryFee: 50,
        }),
      ).rejects.toThrow("User not found");
    });

    it("rejects invalid game ID with VALIDATION_ERROR", async () => {
      const user = await createTestUser("invalid_game", 1000);
      await expect(
        MatchmakingQueueService.joinQueue({
          userId: user.id,
          gameId: "not_a_real_game_xyz",
          entryFee: 50,
        }),
      ).rejects.toThrow("Invalid gameId");
    });

    it("blocks entry when user has insufficient wallet balance", async () => {
      const user = await createTestUser("broke_user", 20);
      await expect(
        MatchmakingQueueService.joinQueue({
          userId: user.id,
          gameId: "carrom",
          entryFee: 100,
        }),
      ).rejects.toThrow("Insufficient coins");
    });

    it("blocks entry when user is already in an active playing match", async () => {
      const user = await createTestUser("active_match_user", 1000);

      // Create an active match for this user
      const match = await prisma.match.create({
        data: {
          id: `active_match_${Date.now()}`,
          gameId: "chess",
          status: "ACTIVE",
          players: {
            create: {
              userId: user.id,
              seat: 0,
            },
          },
        },
      });
      createdMatchIds.push(match.id);

      await expect(
        MatchmakingQueueService.joinQueue({
          userId: user.id,
          gameId: "chess",
          entryFee: 0,
        }),
      ).rejects.toThrow("You are currently in an active match");
    });
  });

  describe("2. Idempotency & Reconnection", () => {
    it("duplicate join requests return existing queue position without creating duplicate records", async () => {
      const user = await createTestUser("idempotent_user", 1000);

      const res1 = await MatchmakingQueueService.joinQueue({
        userId: user.id,
        gameId: "snooker",
        entryFee: 200,
      });

      const res2 = await MatchmakingQueueService.joinQueue({
        userId: user.id,
        gameId: "snooker",
        entryFee: 200,
      });

      expect(res1.queueId).toBe(res2.queueId);
      expect(res2.isExisting).toBe(true);
      expect(res2.position).toBe(1);

      const queueCount = await prisma.matchmakingQueue.count({
        where: { userId: user.id, status: "WAITING" },
      });
      expect(queueCount).toBe(1);
    });

    it("switching to a different game automatically cancels the previous queue entry", async () => {
      const user = await createTestUser("switch_game_user", 1000);

      const res1 = await MatchmakingQueueService.joinQueue({
        userId: user.id,
        gameId: "chess",
        entryFee: 50,
      });

      const res2 = await MatchmakingQueueService.joinQueue({
        userId: user.id,
        gameId: "ludo",
        entryFee: 50,
      });

      expect(res1.queueId).not.toBe(res2.queueId);
      expect(res2.gameId).toBe("ludo");

      const oldQueue = await prisma.matchmakingQueue.findUnique({
        where: { id: res1.queueId },
      });
      expect(oldQueue?.status).toBe("CANCELLED");

      const activeQueues = await prisma.matchmakingQueue.findMany({
        where: { userId: user.id, status: "WAITING" },
      });
      expect(activeQueues).toHaveLength(1);
      expect(activeQueues[0].gameId).toBe("ludo");
    });
  });

  describe("3. Queue Status & Position Tracking", () => {
    it("computes accurate FIFO queue positions for multiple waiting players", async () => {
      const user1 = await createTestUser("pos_u1", 1000);
      const user2 = await createTestUser("pos_u2", 1000);
      const user3 = await createTestUser("pos_u3", 1000);

      const q1 = await MatchmakingQueueService.joinQueue({
        userId: user1.id,
        gameId: "carrom",
        entryFee: 100,
      });

      const q2 = await MatchmakingQueueService.joinQueue({
        userId: user2.id,
        gameId: "carrom",
        entryFee: 100,
      });

      const q3 = await MatchmakingQueueService.joinQueue({
        userId: user3.id,
        gameId: "carrom",
        entryFee: 100,
      });

      expect(q1.position).toBe(1);
      expect(q2.position).toBe(2);
      expect(q3.position).toBe(3);

      const status1 = await MatchmakingQueueService.getQueueStatus(user1.id);
      expect(status1.queued).toBe(true);
      expect(status1.position).toBe(1);

      const status3 = await MatchmakingQueueService.getQueueStatus(user3.id);
      expect(status3.queued).toBe(true);
      expect(status3.position).toBe(3);
    });
  });

  describe("4. Queue Cancellation & Wallet Safety", () => {
    it("cancels waiting queue safely and leaves wallet balance untouched", async () => {
      const user = await createTestUser("cancel_u1", 500);
      const joinRes = await MatchmakingQueueService.joinQueue({
        userId: user.id,
        gameId: "cricket",
        entryFee: 250,
      });

      const cancelRes = await MatchmakingQueueService.cancelQueue(user.id, "cricket");
      expect(cancelRes.cancelled).toBe(true);
      expect(cancelRes.queueId).toBe(joinRes.queueId);

      const queueRecord = await prisma.matchmakingQueue.findUnique({
        where: { id: joinRes.queueId },
      });
      expect(queueRecord?.status).toBe("CANCELLED");

      // Balance remains exactly 500 (never deducted merely for queueing)
      const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      expect(wallet?.balance).toBe(500);

      const status = await MatchmakingQueueService.getQueueStatus(user.id);
      expect(status.queued).toBe(false);
    });
  });

  describe("5. Queue Timeout & Expiration", () => {
    it("sweeps expired queue entries and transitions status to EXPIRED with zero deduction", async () => {
      const user = await createTestUser("expire_u1", 300);
      const joinRes = await MatchmakingQueueService.joinQueue({
        userId: user.id,
        gameId: "bubble-shooter",
        entryFee: 100,
      });

      // Force expiresAt to past
      await prisma.matchmakingQueue.update({
        where: { id: joinRes.queueId },
        data: { expiresAt: new Date(Date.now() - 5000) },
      });

      const sweptCount = await MatchmakingQueueService.sweepExpiredQueues();
      expect(sweptCount).toBeGreaterThanOrEqual(1);

      const queueRecord = await prisma.matchmakingQueue.findUnique({
        where: { id: joinRes.queueId },
      });
      expect(queueRecord?.status).toBe("EXPIRED");

      const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      expect(wallet?.balance).toBe(300);
    });
  });

  describe("6. Game & Stake Isolation", () => {
    it("never matches players waiting for different games", async () => {
      const chessPlayer = await createTestUser("chess_p", 1000);
      const snookerPlayer = await createTestUser("snooker_p", 1000);

      await MatchmakingQueueService.joinQueue({
        userId: chessPlayer.id,
        gameId: "chess",
        entryFee: 100,
      });

      await MatchmakingQueueService.joinQueue({
        userId: snookerPlayer.id,
        gameId: "snooker",
        entryFee: 100,
      });

      // Attempt to match Chess bucket
      const matchChess = await MatchmakingQueueService.tryMatchCompatiblePlayers("chess", 100, "casual", 2);
      expect(matchChess).toBeNull();

      // Attempt to match Snooker bucket
      const matchSnooker = await MatchmakingQueueService.tryMatchCompatiblePlayers("snooker", 100, "casual", 2);
      expect(matchSnooker).toBeNull();
    });

    it("never matches players with incompatible entry stakes (e.g. 10 vs 100 coins)", async () => {
      const lowStakePlayer = await createTestUser("low_stake_p", 1000);
      const highStakePlayer = await createTestUser("high_stake_p", 1000);

      await MatchmakingQueueService.joinQueue({
        userId: lowStakePlayer.id,
        gameId: "carrom",
        entryFee: 10,
      });

      await MatchmakingQueueService.joinQueue({
        userId: highStakePlayer.id,
        gameId: "carrom",
        entryFee: 100,
      });

      const match10 = await MatchmakingQueueService.tryMatchCompatiblePlayers("carrom", 10, "casual", 2);
      expect(match10).toBeNull();

      const match100 = await MatchmakingQueueService.tryMatchCompatiblePlayers("carrom", 100, "casual", 2);
      expect(match100).toBeNull();
    });
  });

  describe("7. Atomic Match Creation & Concurrency Guard", () => {
    it("pairs 2 compatible waiting players into an authoritative match", async () => {
      const playerA = await createTestUser("match_a", 1000);
      const playerB = await createTestUser("match_b", 1000);

      await MatchmakingQueueService.joinQueue({
        userId: playerA.id,
        gameId: "table-tennis",
        entryFee: 100,
      });

      await MatchmakingQueueService.joinQueue({
        userId: playerB.id,
        gameId: "table-tennis",
        entryFee: 100,
      });

      const result = await MatchmakingQueueService.tryMatchCompatiblePlayers("table-tennis", 100, "casual", 2);
      expect(result).not.toBeNull();
      expect(result?.gameId).toBe("table-tennis");
      expect(result?.entryFee).toBe(100);
      expect(result?.playerIds).toContain(playerA.id);
      expect(result?.playerIds).toContain(playerB.id);
      expect(result?.roomId).toBeDefined();
      expect(result?.matchId).toBeDefined();

      // Check DB records are marked MATCHED
      const queues = await prisma.matchmakingQueue.findMany({
        where: { userId: { in: [playerA.id, playerB.id] } },
      });
      expect(queues).toHaveLength(2);
      expect(queues.every((q) => q.status === "MATCHED")).toBe(true);
      expect(queues.every((q) => q.matchId === result?.matchId)).toBe(true);
    });

    it("prevents double-matching when multiple workers try to match simultaneously", async () => {
      const p1 = await createTestUser("conc_p1", 1000);
      const p2 = await createTestUser("conc_p2", 1000);

      await MatchmakingQueueService.joinQueue({
        userId: p1.id,
        gameId: "snake-ladder",
        entryFee: 50,
      });

      await MatchmakingQueueService.joinQueue({
        userId: p2.id,
        gameId: "snake-ladder",
        entryFee: 50,
      });

      // Fire 5 concurrent matching workers
      const matchPromises = Array.from({ length: 5 }, () =>
        MatchmakingQueueService.tryMatchCompatiblePlayers("snake-ladder", 50, "casual", 2),
      );

      const results = await Promise.all(matchPromises);
      const successfulMatches = results.filter((r) => r !== null);

      // Exactly 1 worker must succeed, all others return null
      expect(successfulMatches).toHaveLength(1);
    });
  });

  describe("8. Server Boot & Recovery", () => {
    it("sweeps lingering WAITING records on startup recovery", async () => {
      const user = await createTestUser("boot_p1", 1000);
      await MatchmakingQueueService.joinQueue({
        userId: user.id,
        gameId: "ludo",
        entryFee: 100,
      });

      await MatchmakingQueueService.recoverOnStartup();

      const queueRecord = await prisma.matchmakingQueue.findFirst({
        where: { userId: user.id },
      });
      expect(queueRecord?.status).toBe("EXPIRED");
    });
  });

  describe("9. Full Verification Across All 10 Games", () => {
    for (const gameId of ALL_10_GAMES) {
      it(`successfully queues and pairs players for ${gameId}`, async () => {
        const p1 = await createTestUser(`p1_${gameId}`, 2000);
        const p2 = await createTestUser(`p2_${gameId}`, 2000);

        const q1 = await MatchmakingQueueService.joinQueue({
          userId: p1.id,
          gameId,
          entryFee: 200,
        });
        expect(q1.queued).toBe(true);

        const q2 = await MatchmakingQueueService.joinQueue({
          userId: p2.id,
          gameId,
          entryFee: 200,
        });
        expect(q2.queued).toBe(true);

        const match = await MatchmakingQueueService.tryMatchCompatiblePlayers(gameId, 200, "casual", 2);
        expect(match).not.toBeNull();
        expect(match?.gameId).toBe(gameId);
        expect(match?.playerIds).toHaveLength(2);
      });
    }
  });
});
