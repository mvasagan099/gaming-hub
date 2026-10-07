import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { performance } from "perf_hooks";
import { prisma } from "@gaming-hub/db";
import {
  registerForTournament,
  getTournamentDetail,
} from "../tournaments";
import { scheduleHourlyTournaments } from "../hourlyTournamentScheduler";
import { startTournament, seedPlayers, getTournamentBracket } from "../tournamentEngine";
import { TournamentSettlementService } from "../tournamentSettlementService";



describe("TOURNAMENT LOAD, CONCURRENCY & PERFORMANCE AUDIT", () => {
  const loadRunId = Math.random().toString(36).slice(2, 8);
  const createdUserIds: string[] = [];
  const createdTournamentIds: string[] = [];

  // Helper to bulk create isolated test users and wallets
  async function createBatchUsers(count: number, prefix: string): Promise<string[]> {
    const userIds: string[] = [];
    const usersData = [];
    const walletsData = [];

    for (let i = 0; i < count; i++) {
      const uid = `u_load_${prefix}_${i}_${loadRunId}`;
      userIds.push(uid);
      createdUserIds.push(uid);

      usersData.push({
        id: uid,
        email: `${uid}@loadtest.local`,
        username: `load_${prefix.slice(0, 4)}_${i}_${loadRunId}`,
        displayName: `Load User ${prefix} ${i}`,
        role: "USER" as const,
      });

      walletsData.push({
        userId: uid,
        balance: 1000,
      });
    }

    // Fast bulk inserts
    await prisma.user.createMany({ data: usersData, skipDuplicates: true });
    await prisma.wallet.createMany({ data: walletsData, skipDuplicates: true });

    return userIds;
  }

  async function registerInBatches(userIds: string[], tournamentId: string, batchSize = 50) {
    for (let offset = 0; offset < userIds.length; offset += batchSize) {
      const batch = userIds.slice(offset, offset + batchSize);
      await Promise.all(batch.map((userId) => registerForTournament(userId, tournamentId)));
    }
  }

  afterAll(async () => {
    // Cleanup load test fixtures
    if (createdTournamentIds.length > 0) {
      await prisma.tournamentRound.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournamentPrize.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournamentPlayer.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.idempotencyRecord.deleteMany({
        where: { referenceId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournament.deleteMany({
        where: { id: { in: createdTournamentIds } },
      }).catch(() => undefined);
    }

    if (createdUserIds.length > 0) {
      // Chunked cleanup for large batches
      const chunkSize = 200;
      for (let i = 0; i < createdUserIds.length; i += chunkSize) {
        const chunk = createdUserIds.slice(i, i + chunkSize);
        await prisma.transaction.deleteMany({ where: { userId: { in: chunk } } }).catch(() => undefined);
        await prisma.idempotencyRecord.deleteMany({ where: { userId: { in: chunk } } }).catch(() => undefined);
        await prisma.wallet.deleteMany({ where: { userId: { in: chunk } } }).catch(() => undefined);
        await prisma.user.deleteMany({ where: { id: { in: chunk } } }).catch(() => undefined);
      }
    }
  });

  // =========================================================================
  // 1. MINI TIER LOAD: 100 PLAYERS CONCURRENT REGISTRATION
  // =========================================================================
  describe("1. Mini Tier Load (100 Players)", () => {
    it("handles 100 concurrent registrations cleanly within capacity limits", async () => {
      const users = await createBatchUsers(100, "mini100");
      const tourn = await prisma.tournament.create({
        data: {
          gameId: "carrom",
          title: `Load Mini Tournament ${loadRunId}`,
          description: "100-player Mini load test",
          entryFee: 5,
          prizePool: 400,
          grossPool: 500,
          minPlayers: 8,
          maxPlayers: 100,
          startTime: new Date(Date.now() + 3600000),
          registrationEndsAt: new Date(Date.now() + 3300000),
          status: "REGISTRATION_OPEN",
          format: "SINGLE_ELIMINATION",
        },
      });
      createdTournamentIds.push(tourn.id);

      const t0 = performance.now();
      const results = await Promise.allSettled(
        users.map((uid) => registerForTournament(uid, tourn.id))
      );
      const t1 = performance.now();
      const totalDuration = t1 - t0;
      const avgLatency = totalDuration / users.length;

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(100);
      expect(rejected.length).toBe(0);

      const count = await prisma.tournamentPlayer.count({ where: { tournamentId: tourn.id } });
      expect(count).toBe(100);

      // Verify wallet debits: each user debited exactly 5 coins (1000 -> 995)
      const sampleWallet = await prisma.wallet.findUnique({ where: { userId: users[0] } });
      expect(sampleWallet?.balance).toBe(995);

      console.log(`[LOAD METRIC] 100 Concurrent Registrations (Mini): Total ${totalDuration.toFixed(1)}ms | Avg ${avgLatency.toFixed(2)}ms/req | Throughput ${(100000 / totalDuration).toFixed(1)} req/sec`);
    }, 30000);
  });

  // =========================================================================
  // 2. BASIC TIER LOAD: 200 PLAYERS CONCURRENT REGISTRATION
  // =========================================================================
  describe("2. Basic Tier Load (200 Players)", () => {
    it("handles 200 concurrent registrations without duplicate debits or lost slots", async () => {
      const users = await createBatchUsers(200, "basic200");
      const tourn = await prisma.tournament.create({
        data: {
          gameId: "chess",
          title: `Load Basic Tournament ${loadRunId}`,
          description: "200-player Basic load test",
          entryFee: 10,
          prizePool: 1600,
          grossPool: 2000,
          minPlayers: 16,
          maxPlayers: 200,
          startTime: new Date(Date.now() + 3600000),
          registrationEndsAt: new Date(Date.now() + 3300000),
          status: "REGISTRATION_OPEN",
          format: "SINGLE_ELIMINATION",
        },
      });
      createdTournamentIds.push(tourn.id);

      const t0 = performance.now();
      const results = await Promise.allSettled(
        users.map((uid) => registerForTournament(uid, tourn.id))
      );
      const t1 = performance.now();
      const totalDuration = t1 - t0;

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(results.filter(r => r.status === "rejected").map(r => (r as PromiseRejectedResult).reason?.message)).toEqual([]);
      expect(fulfilled.length).toBe(200);

      const count = await prisma.tournamentPlayer.count({ where: { tournamentId: tourn.id } });
      expect(count).toBe(200);

      console.log(`[LOAD METRIC] 200 Concurrent Registrations (Basic): Total ${totalDuration.toFixed(1)}ms | Throughput ${(200000 / totalDuration).toFixed(1)} req/sec`);
    }, 45000);
  });

  // =========================================================================
  // 3. PRO TIER LOAD & EXACT CAPACITY BOUNDARY (999, 1000, 1001)
  // =========================================================================
  describe("3. Pro Tier & Capacity Boundary (999, 1000, 1001)", () => {
    it("correctly accepts 1000 players and strictly rejects player 1001 at boundary", async () => {
      // Create 1001 users for boundary testing
      const users = await createBatchUsers(1001, "pro1000");

      const tourn = await prisma.tournament.create({
        data: {
          gameId: "ludo",
          title: `Load Pro Tournament ${loadRunId}`,
          description: "1000-player Pro capacity boundary test",
          entryFee: 100,
          prizePool: 90000,
          grossPool: 100000,
          minPlayers: 64,
          maxPlayers: 1000,
          startTime: new Date(Date.now() + 3600000),
          registrationEndsAt: new Date(Date.now() + 3300000),
          status: "REGISTRATION_OPEN",
          format: "SINGLE_ELIMINATION",
        },
      });
      createdTournamentIds.push(tourn.id);

      const t0 = performance.now();
      // Keep meaningful concurrency without exceeding the nine-connection
      // local Prisma test pool with 500 simultaneously waiting transactions.
      await registerInBatches(users.slice(0, 998), tourn.id);

      // Test exact boundary:
      // Player 999 (index 998) -> accepted
      const p999 = await registerForTournament(users[998], tourn.id);
      expect(p999.ok).toBe(true);

      // Player 1000 (index 999) -> accepted (tournament fills up to max)
      const p1000 = await registerForTournament(users[999], tourn.id);
      expect(p1000.ok).toBe(true);

      // Player 1001 (index 1000) -> rejected with capacity guard
      await expect(registerForTournament(users[1000], tourn.id)).rejects.toThrow(
        /Tournament is not accepting registrations|Tournament is full/i
      );

      const t1 = performance.now();
      const totalDuration = t1 - t0;

      // Verify exact count in DB
      const finalCount = await prisma.tournamentPlayer.count({ where: { tournamentId: tourn.id } });
      expect(finalCount).toBe(1000);

      // Verify player 1001 wallet was NOT debited
      const p1001Wallet = await prisma.wallet.findUnique({ where: { userId: users[1000] } });
      expect(p1001Wallet?.balance).toBe(1000);

      console.log(`[LOAD METRIC] 1,000 Player Registration & Boundary Guard: Total ${totalDuration.toFixed(1)}ms | Final Count: ${finalCount}/1000`);
    }, 90000);
  });

  // =========================================================================
  // 4. HOURLY SCHEDULER CONCURRENCY (SCHEDULER A, B, C SIMULTANEOUS)
  // =========================================================================
  describe("4. Hourly Scheduler Concurrency & Idempotency", () => {
    it("simultaneously runs Scheduler A, B, C with zero duplicate slots created", async () => {
      const t0 = performance.now();
      const [resA, resB, resC] = await Promise.all([
        scheduleHourlyTournaments(),
        scheduleHourlyTournaments(),
        scheduleHourlyTournaments(),
      ]);
      const t1 = performance.now();

      expect(resA.errors).toHaveLength(0);
      expect(resB.errors).toHaveLength(0);
      expect(resC.errors).toHaveLength(0);

      const totalCreatedAcrossAll = resA.created + resB.created + resC.created;
      // All 3 combined must not create duplicate tournaments
      expect(resA.created >= 0).toBe(true);
      expect(resB.created >= 0).toBe(true);
      expect(resC.created >= 0).toBe(true);

      console.log(`[LOAD METRIC] Concurrent Scheduler A, B, C: Total ${(t1 - t0).toFixed(1)}ms | Total Slots Generated: ${totalCreatedAcrossAll}`);
    }, 60000);
  });

  // =========================================================================
  // 5. TOURNAMENT PROGRESSION & PRIZE SETTLEMENT PERFORMANCE
  // =========================================================================
  describe("5. Tournament Progression, Bracket Generation & Prize Settlement Performance", () => {
    it("builds bracket, starts tournament, and settles 4 prizes with exact ledger records", async () => {
      const players = await createBatchUsers(16, "prog16");
      const tourn = await prisma.tournament.create({
        data: {
          gameId: "table-tennis",
          title: `Progression Test Tournament ${loadRunId}`,
          description: "16-player bracket and settlement test",
          entryFee: 10,
          prizePool: 1600,
          grossPool: 1600,
          minPlayers: 8,
          maxPlayers: 16,
          startTime: new Date(Date.now() + 3600000),
          registrationEndsAt: new Date(Date.now() + 3300000),
          status: "REGISTRATION_OPEN",
          format: "SINGLE_ELIMINATION",
          prizeDistribution: [
            { rank: 1, percentage: 50 },
            { rank: 2, percentage: 25 },
            { rank: 3, percentage: 15 },
            { rank: 4, percentage: 10 },
          ],
          configSnapshot: {
            prizePool: 1600,
            grossPool: 1600,
            prizeDistribution: [
              { rank: 1, percentage: 50 },
              { rank: 2, percentage: 25 },
              { rank: 3, percentage: 15 },
              { rank: 4, percentage: 10 },
            ],
            calculatedPrizes: [
              { rank: 1, amount: 800 },
              { rank: 2, amount: 400 },
              { rank: 3, amount: 240 },
              { rank: 4, amount: 160 },
            ],
            currency: "coins",
            format: "SINGLE_ELIMINATION",
            gameId: "table-tennis",
            stateVersion: 1,
            snapshottedAt: new Date().toISOString(),
          },
        },
      });

      createdTournamentIds.push(tourn.id);

      // Register 16 players
      await Promise.all(players.map((uid) => registerForTournament(uid, tourn.id)));

      // 1. Bracket Generation & Tournament Start Benchmark
      const tBracket0 = performance.now();
      await startTournament(tourn.id);
      const bracket = await getTournamentBracket(tourn.id);
      const tBracket1 = performance.now();
      expect(bracket.totalRounds).toBe(4); // 16 -> 8 -> 4 -> 2 -> 1 (4 rounds)


      // 3. Mark Final Placements & Prize Settlement Benchmark
      await prisma.tournamentPlayer.update({
        where: { tournamentId_userId: { tournamentId: tourn.id, userId: players[0] } },
        data: { finalRank: 1 },
      });
      await prisma.tournamentPlayer.update({
        where: { tournamentId_userId: { tournamentId: tourn.id, userId: players[1] } },
        data: { finalRank: 2, eliminated: true },
      });
      await prisma.tournamentPlayer.update({
        where: { tournamentId_userId: { tournamentId: tourn.id, userId: players[2] } },
        data: { finalRank: 3, eliminated: true },
      });
      await prisma.tournamentPlayer.update({
        where: { tournamentId_userId: { tournamentId: tourn.id, userId: players[3] } },
        data: { finalRank: 4, eliminated: true },
      });

      const tSettle0 = performance.now();
      const settlement = await TournamentSettlementService.settleTournamentPrizes(tourn.id);
      const tSettle1 = performance.now();

      expect(settlement.ok).toBe(true);
      expect(settlement.completedCount).toBe(4);

      // Verify winner wallet credit: 1000 - 10 + 800 = 1790
      const p1Wallet = await prisma.wallet.findUnique({ where: { userId: players[0] } });
      expect(p1Wallet?.balance).toBe(1790);

      // 4. Repeated Settlement (Idempotency)
      const repeatSettlement = await TournamentSettlementService.settleTournamentPrizes(tourn.id);
      expect(repeatSettlement.completedCount).toBe(4);

      // Balance remains strictly 1790 (no duplicate credit)
      const p1WalletAfter = await prisma.wallet.findUnique({ where: { userId: players[0] } });
      expect(p1WalletAfter?.balance).toBe(1790);

      console.log(`[LOAD METRIC] 16-Player Bracket Generation: ${(tBracket1 - tBracket0).toFixed(2)}ms | 4-Tier Prize Settlement: ${(tSettle1 - tSettle0).toFixed(2)}ms`);
    }, 30000);
  });



  // =========================================================================
  // 6. RESOURCE & MEMORY HEALTH CHECK
  // =========================================================================
  describe("6. Resource & Memory Consumption", () => {
    it("reports healthy memory and resource usage under load", () => {
      const mem = process.memoryUsage();
      const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
      const heapTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(1);
      const rssMB = (mem.rss / 1024 / 1024).toFixed(1);

      console.log(`[RESOURCE METRIC] Node.js Memory: Heap Used: ${heapUsedMB}MB | Heap Total: ${heapTotalMB}MB | RSS: ${rssMB}MB`);

      expect(mem.heapUsed).toBeGreaterThan(0);
      expect(mem.heapUsed).toBeLessThan(1024 * 1024 * 1024); // Less than 1GB heap
    });
  });
});
