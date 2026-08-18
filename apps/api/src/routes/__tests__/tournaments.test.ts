// @ts-nocheck
import { beforeAll, afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";
import { buildApp } from "../../app";
import { createTestUser } from "../../../test/helpers";
import {
  processMatchResult,
  settleTournament,
  startTournament,
  cancelTournamentWithRefunds,
  getTournamentBracket,
  getPlayerTournamentStatus,
} from "../../services/tournamentEngine";
import {
  nextPowerOfTwo,
  computeByeCount,
  computeTotalRounds,
  generateFirstRoundSlots,
} from "@gaming-hub/shared";

async function injectJSON(app, method, url, payload, token) {
  return app.inject({
    method,
    url,
    payload,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

async function createTournament(adminToken, app, overrides = {}) {
  const res = await injectJSON(app, "POST", "/api/admin/tournaments", {
    gameId: "chess",
    title: "Test Tournament",
    format: "SINGLE_ELIMINATION",
    entryFee: 0,
    prizePool: 400,
    maxPlayers: 8,
    minPlayers: 2,
    startTime: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  }, adminToken);
  expect(res.statusCode).toBe(200);
  return res.json();
}

async function openReg(app, id, adminToken) {
  return injectJSON(app, "POST", `/api/admin/tournaments/${id}/open-registration`, undefined, adminToken);
}

async function registerPlayer(tournamentId, userToken, app) {
  return injectJSON(app, "POST", `/api/tournaments/${tournamentId}/register`, undefined, userToken);
}

async function seedPlayers(count, tournamentId, app) {
  const players = [];
  for (let i = 0; i < count; i++) {
    const user = await createTestUser();
    await prisma.wallet.update({ where: { userId: user.id }, data: { balance: 10000 } });
    const res = await registerPlayer(tournamentId, user.token, app);
    expect(res.statusCode, `player ${i} registration`).toBe(200);
    players.push(user);
  }
  return players;
}

describe("Tournament Engine", () => {
  let app;
  let admin;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
    admin = await createTestUser({ role: "ADMIN" });
  });

  afterEach(async () => {
    await prisma.tournamentResultIdempotency.deleteMany();
    await prisma.tournamentPrize.deleteMany();
    await prisma.tournamentRound.deleteMany();
    await prisma.tournamentPlayer.deleteMany();
    await prisma.tournament.deleteMany();
  });

  describe("Bracket utilities", () => {
    it("nextPowerOfTwo: correct values", () => {
      expect(nextPowerOfTwo(2)).toBe(2);
      expect(nextPowerOfTwo(3)).toBe(4);
      expect(nextPowerOfTwo(4)).toBe(4);
      expect(nextPowerOfTwo(5)).toBe(8);
      expect(nextPowerOfTwo(8)).toBe(8);
      expect(nextPowerOfTwo(9)).toBe(16);
      expect(nextPowerOfTwo(16)).toBe(16);
    });

    it("computeByeCount: correct BYE counts", () => {
      expect(computeByeCount(4)).toBe(0);
      expect(computeByeCount(5)).toBe(3);
      expect(computeByeCount(6)).toBe(2);
      expect(computeByeCount(7)).toBe(1);
      expect(computeByeCount(8)).toBe(0);
    });

    it("computeTotalRounds: log2(bracketSize)", () => {
      expect(computeTotalRounds(2)).toBe(1);
      expect(computeTotalRounds(4)).toBe(2);
      expect(computeTotalRounds(8)).toBe(3);
      expect(computeTotalRounds(16)).toBe(4);
    });

    it("generateFirstRoundSlots: 4 players produces 2 slots, no BYEs", () => {
      const slots = generateFirstRoundSlots(["a", "b", "c", "d"]);
      expect(slots).toHaveLength(2);
      expect(slots.every((s) => !s.isBye)).toBe(true);
      expect(slots[0].playerAId).toBe("a");
      expect(slots[0].playerBId).toBe("d");
      expect(slots[1].playerAId).toBe("b");
      expect(slots[1].playerBId).toBe("c");
    });

    it("generateFirstRoundSlots: 5 players produces 4 slots with 3 BYEs", () => {
      const slots = generateFirstRoundSlots(["a", "b", "c", "d", "e"]);
      expect(slots).toHaveLength(4);
      const byeSlots = slots.filter((s) => s.isBye);
      expect(byeSlots).toHaveLength(3);
    });

    it("generateFirstRoundSlots: 8 players produces 4 slots, no BYEs", () => {
      const players = ["a", "b", "c", "d", "e", "f", "g", "h"];
      const slots = generateFirstRoundSlots(players);
      expect(slots).toHaveLength(4);
      expect(slots.every((s) => !s.isBye)).toBe(true);
    });
  });

  describe("Registration", () => {
    it("registers a player for an open tournament", async () => {
      const t = await createTournament(admin.token, app);
      await openReg(app, t.id, admin.token);
      const user = await createTestUser();
      const res = await registerPlayer(t.id, user.token, app);
      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);
    });

    it("rejects duplicate registration (idempotency)", async () => {
      const t = await createTournament(admin.token, app);
      await openReg(app, t.id, admin.token);
      const user = await createTestUser();
      await registerPlayer(t.id, user.token, app);
      const res2 = await registerPlayer(t.id, user.token, app);
      expect(res2.statusCode).toBe(400);
      expect(res2.json().error.code).toBe("TOURNAMENT_ALREADY_REGISTERED");
    });

    it("rejects registration when tournament is DRAFT", async () => {
      const t = await createTournament(admin.token, app);
      const user = await createTestUser();
      const res = await registerPlayer(t.id, user.token, app);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("TOURNAMENT_STARTED");
    });

    it("rejects registration for a full tournament", async () => {
      const t = await createTournament(admin.token, app, { maxPlayers: 2 });
      await openReg(app, t.id, admin.token);
      await seedPlayers(2, t.id, app);
      const overflow = await createTestUser();
      const res = await registerPlayer(t.id, overflow.token, app);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("TOURNAMENT_FULL");
    });

    it("cancels registration and refunds entry fee", async () => {
      const t = await createTournament(admin.token, app, { entryFee: 100, prizePool: 0 });
      await openReg(app, t.id, admin.token);
      const user = await createTestUser();
      await prisma.wallet.update({ where: { userId: user.id }, data: { balance: 5000 } });
      await registerPlayer(t.id, user.token, app);
      const walletBefore = await prisma.wallet.findUnique({ where: { userId: user.id } });
      expect(walletBefore.balance).toBe(4900);
      const cancel = await injectJSON(app, "POST", `/api/tournaments/${t.id}/cancel`, undefined, user.token);
      expect(cancel.statusCode).toBe(200);
      const walletAfter = await prisma.wallet.findUnique({ where: { userId: user.id } });
      expect(walletAfter.balance).toBe(5000);
    });
  });

  describe("Admin lifecycle", () => {
    it("follows DRAFT to REGISTRATION_OPEN to IN_PROGRESS", async () => {
      const t = await createTournament(admin.token, app);
      const db0 = await prisma.tournament.findUnique({ where: { id: t.id }, select: { status: true } });
      expect(db0.status).toBe("DRAFT");
      await openReg(app, t.id, admin.token);
      const db1 = await prisma.tournament.findUnique({ where: { id: t.id }, select: { status: true } });
      expect(db1.status).toBe("REGISTRATION_OPEN");
      await seedPlayers(2, t.id, app);
      await startTournament(t.id, admin.id);
      const db2 = await prisma.tournament.findUnique({ where: { id: t.id }, select: { status: true } });
      expect(db2.status).toBe("IN_PROGRESS");
    });

    it("rejects invalid state transition", async () => {
      const t = await createTournament(admin.token, app);
      const res = await injectJSON(app, "POST", `/api/admin/tournaments/${t.id}/close-registration`, undefined, admin.token);
      expect(res.statusCode).toBe(409);
    });
  });

  describe("Bracket generation", () => {
    async function prep(playerCount) {
      const t = await createTournament(admin.token, app, { maxPlayers: 16 });
      await openReg(app, t.id, admin.token);
      await seedPlayers(playerCount, t.id, app);
      await startTournament(t.id, admin.id);
      return t.id;
    }

    it("4-player bracket: 2 R1 slots, 1 final", async () => {
      const id = await prep(4);
      const b = await getTournamentBracket(id);
      expect(b.totalRounds).toBe(2);
      expect(b.rounds[0].slots).toHaveLength(2);
      expect(b.rounds[1].slots).toHaveLength(1);
    });

    it("8-player bracket: 4 R1 slots, 3 rounds", async () => {
      const id = await prep(8);
      const b = await getTournamentBracket(id);
      expect(b.totalRounds).toBe(3);
      expect(b.rounds[0].slots).toHaveLength(4);
    });

    it("5-player bracket: 3 BYEs auto-advanced", async () => {
      const id = await prep(5);
      const b = await getTournamentBracket(id);
      expect(b.rounds[0].slots).toHaveLength(4);
      const byeSlots = b.rounds[0].slots.filter((s) => s.isBye);
      expect(byeSlots).toHaveLength(3);
      byeSlots.forEach((s) => expect(s.status).toBe("BYE"));
    });

    it("all READY slots have both players", async () => {
      const id = await prep(4);
      const b = await getTournamentBracket(id);
      b.rounds[0].slots.filter((s) => s.status === "READY").forEach((s) => {
        expect(s.playerAId).not.toBeNull();
        expect(s.playerBId).not.toBeNull();
      });
    });
  });

  describe("Match result processing", () => {
    it("advancing a winner populates the next slot", async () => {
      const t = await createTournament(admin.token, app, { maxPlayers: 4 });
      await openReg(app, t.id, admin.token);
      await seedPlayers(4, t.id, app);
      await startTournament(t.id, admin.id);
      const b = await getTournamentBracket(t.id);
      const slot = b.rounds[0].slots[0];
      const winnerId = slot.playerAId;
      const dbSlot = await prisma.tournamentRound.findFirst({ where: { tournamentId: t.id, roundNumber: 1, matchNumber: slot.matchNumber } });
      const fakeMatchId = `tm_${Date.now()}`;
      await prisma.match.create({ data: { id: fakeMatchId, gameId: "chess", status: "ACTIVE", stake: 0, players: { create: [{ userId: winnerId, seat: 0 }, { userId: slot.playerBId, seat: 1 }] } } });
      await processMatchResult({ matchId: fakeMatchId, tournamentId: t.id, roundId: dbSlot.id, winnerId });
      const r2 = await prisma.tournamentRound.findFirst({ where: { tournamentId: t.id, roundNumber: 2 } });
      expect(r2.playerAId === winnerId || r2.playerBId === winnerId).toBe(true);
    });

    it("processMatchResult is idempotent", async () => {
      const t = await createTournament(admin.token, app, { maxPlayers: 4 });
      await openReg(app, t.id, admin.token);
      await seedPlayers(4, t.id, app);
      await startTournament(t.id, admin.id);
      const b = await getTournamentBracket(t.id);
      const slot = b.rounds[0].slots[0];
      const dbSlot = await prisma.tournamentRound.findFirst({ where: { tournamentId: t.id, roundNumber: 1, matchNumber: slot.matchNumber } });
      const winnerId = slot.playerAId;
      const fakeMatchId = `idem_${Date.now()}`;
      await prisma.match.create({ data: { id: fakeMatchId, gameId: "chess", status: "ACTIVE", stake: 0, players: { create: [{ userId: winnerId, seat: 0 }, { userId: slot.playerBId, seat: 1 }] } } });
      await processMatchResult({ matchId: fakeMatchId, tournamentId: t.id, roundId: dbSlot.id, winnerId });
      await expect(processMatchResult({ matchId: fakeMatchId, tournamentId: t.id, roundId: dbSlot.id, winnerId })).resolves.not.toThrow();
      const records = await prisma.tournamentResultIdempotency.count({ where: { matchId: fakeMatchId } });
      expect(records).toBe(1);
    });

    it("loser is marked as eliminated", async () => {
      const t = await createTournament(admin.token, app, { maxPlayers: 4 });
      await openReg(app, t.id, admin.token);
      await seedPlayers(4, t.id, app);
      await startTournament(t.id, admin.id);
      const b = await getTournamentBracket(t.id);
      const slot = b.rounds[0].slots[0];
      const dbSlot = await prisma.tournamentRound.findFirst({ where: { tournamentId: t.id, roundNumber: 1, matchNumber: slot.matchNumber } });
      const winnerId = slot.playerAId;
      const loserId = slot.playerBId;
      const fakeMatchId = `elim_${Date.now()}`;
      await prisma.match.create({ data: { id: fakeMatchId, gameId: "chess", status: "ACTIVE", stake: 0, players: { create: [{ userId: winnerId, seat: 0 }, { userId: loserId, seat: 1 }] } } });
      await processMatchResult({ matchId: fakeMatchId, tournamentId: t.id, roundId: dbSlot.id, winnerId, loserId });
      const loser = await prisma.tournamentPlayer.findUnique({ where: { tournamentId_userId: { tournamentId: t.id, userId: loserId } } });
      expect(loser.eliminated).toBe(true);
      expect(loser.eliminatedInRound).toBe(1);
    });
  });

  describe("Settlement", () => {
    it("settleTournament is idempotent", async () => {
      const t = await createTournament(admin.token, app, { maxPlayers: 4, prizePool: 400 });
      await openReg(app, t.id, admin.token);
      const players = await seedPlayers(4, t.id, app);
      await startTournament(t.id, admin.id);
      await prisma.tournamentPlayer.updateMany({ where: { tournamentId: t.id, userId: players[0].id }, data: { finalRank: 1 } });
      await prisma.tournament.update({ where: { id: t.id }, data: { status: "COMPLETED" } });
      await settleTournament(t.id);
      const w1 = await prisma.wallet.findUnique({ where: { userId: players[0].id }, select: { balance: true } });
      await settleTournament(t.id);
      const w2 = await prisma.wallet.findUnique({ where: { userId: players[0].id }, select: { balance: true } });
      expect(w1.balance).toBe(w2.balance);
      const n = await prisma.tournamentPrize.count({ where: { tournamentId: t.id, userId: players[0].id } });
      expect(n).toBe(1);
    });

    it("prizes credited correctly for rank 1", async () => {
      const t = await createTournament(admin.token, app, { maxPlayers: 4, prizePool: 1000 });
      await openReg(app, t.id, admin.token);
      const players = await seedPlayers(4, t.id, app);
      await startTournament(t.id, admin.id);
      await prisma.tournament.update({ where: { id: t.id }, data: { grossPool: 1000, status: "COMPLETED" } });
      await prisma.tournamentPlayer.updateMany({ where: { tournamentId: t.id, userId: players[0].id }, data: { finalRank: 1 } });
      const before = (await prisma.wallet.findUnique({ where: { userId: players[0].id }, select: { balance: true } })).balance;
      await settleTournament(t.id);
      const after = (await prisma.wallet.findUnique({ where: { userId: players[0].id }, select: { balance: true } })).balance;
      expect(after - before).toBe(600);
    });
  });

  describe("Cancellation", () => {
    it("refunds entry fees to all players on cancel", async () => {
      const t = await createTournament(admin.token, app, { entryFee: 100, prizePool: 0 });
      await openReg(app, t.id, admin.token);
      const players = await seedPlayers(4, t.id, app);
      const before = await Promise.all(players.map((p) => prisma.wallet.findUnique({ where: { userId: p.id }, select: { balance: true } })));
      await cancelTournamentWithRefunds(t.id, "Test cancel", admin.id);
      const after = await Promise.all(players.map((p) => prisma.wallet.findUnique({ where: { userId: p.id }, select: { balance: true } })));
      for (let i = 0; i < players.length; i++) {
        expect(after[i].balance).toBe(before[i].balance + 100);
      }
    });

    it("tournament status is CANCELLED after cancel", async () => {
      const t = await createTournament(admin.token, app);
      await cancelTournamentWithRefunds(t.id, "test");
      const db = await prisma.tournament.findUnique({ where: { id: t.id }, select: { status: true } });
      expect(db.status).toBe("CANCELLED");
    });
  });

  describe("Player status", () => {
    it("returns isRegistered=false for unregistered user", async () => {
      const t = await createTournament(admin.token, app);
      const user = await createTestUser();
      const s = await getPlayerTournamentStatus(t.id, user.id);
      expect(s.isRegistered).toBe(false);
    });

    it("returns correct seed and not eliminated after registration", async () => {
      const t = await createTournament(admin.token, app);
      await openReg(app, t.id, admin.token);
      const [player] = await seedPlayers(1, t.id, app);
      const s = await getPlayerTournamentStatus(t.id, player.id);
      expect(s.isRegistered).toBe(true);
      expect(s.eliminated).toBe(false);
    });
  });

  describe("HTTP API", () => {
    it("GET bracket returns structured data", async () => {
      const t = await createTournament(admin.token, app);
      await openReg(app, t.id, admin.token);
      await seedPlayers(4, t.id, app);
      await startTournament(t.id, admin.id);
      const user = await createTestUser();
      const res = await injectJSON(app, "GET", `/api/tournaments/${t.id}/bracket`, undefined, user.token);
      expect(res.statusCode).toBe(200);
      const b = res.json();
      expect(b.tournamentId).toBe(t.id);
      expect(b.totalRounds).toBe(2);
    });

    it("GET state returns combined shape", async () => {
      const t = await createTournament(admin.token, app);
      await openReg(app, t.id, admin.token);
      await seedPlayers(4, t.id, app);
      await startTournament(t.id, admin.id);
      const user = await createTestUser();
      const res = await injectJSON(app, "GET", `/api/tournaments/${t.id}/state`, undefined, user.token);
      expect(res.statusCode).toBe(200);
      const b = res.json();
      expect(b).toHaveProperty("detail");
      expect(b).toHaveProperty("bracket");
      expect(b).toHaveProperty("myStatus");
    });

    it("admin list requires ADMIN role", async () => {
      const user = await createTestUser();
      const res = await injectJSON(app, "GET", "/api/admin/tournaments", undefined, user.token);
      expect(res.statusCode).toBe(403);
    });

    it("admin can list tournaments", async () => {
      await createTournament(admin.token, app);
      const res = await injectJSON(app, "GET", "/api/admin/tournaments", undefined, admin.token);
      expect(res.statusCode).toBe(200);
      expect(res.json().total).toBeGreaterThanOrEqual(1);
    });
  });
});