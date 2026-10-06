import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";
import { GAME_IDS } from "@gaming-hub/shared";
import { MultiplayerFramework } from "@gaming-hub/multiplayer";
import { createIoStub, makeSocket } from "../../../../../packages/multiplayer/__tests__/helpers";
import { createTestUser } from "../../../test/helpers";
import { WalletTransactionService } from "../../services/walletTransactionService";
import { internalRoutes } from "../internal";
import { registerErrorHandler } from "../../plugins/errors";
import { env } from "../../env";

describe("funded multiplayer startup through the socket-to-API HTTP route", () => {
  let app: FastifyInstance;
  let framework: MultiplayerFramework;
  let api: typeof import("../../../../socket-server/src/apiClient");
  const originalApiUrl = process.env.API_URL;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    registerErrorHandler(app);
    await app.register(internalRoutes);
    process.env.API_URL = await app.listen({ host: "127.0.0.1", port: 0 });
    api = await import("../../../../socket-server/src/apiClient");
  });

  beforeEach(() => {
    MultiplayerFramework.resetInstance();
    framework = MultiplayerFramework.getInstance({
      io: createIoStub(),
      enableReplay: false,
      onMatchStarting: async (room, matchId) => { await api.createAndFundRoomMatch(room, matchId); },
    });
  });

  afterEach(async () => {
    await framework.shutdown();
    MultiplayerFramework.resetInstance();
  });

  afterAll(async () => {
    await app.close();
    if (originalApiUrl === undefined) delete process.env.API_URL;
    else process.env.API_URL = originalApiUrl;
  });

  async function player(amount = 1000) {
    const user = await createTestUser();
    const initial = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(initial.balance).toBe(0);
    if (amount > 0) await prisma.$transaction(tx => WalletTransactionService.createCredit(tx, {
      userId: user.id, amount, walletType: "MAIN", referenceType: "ADMIN",
      referenceId: `startup-fixture-${user.id}`, meta: { reason: "disposable test fixture" },
    }));
    return user;
  }

  it.each(GAME_IDS)("persists a new %s room before match funding and charges each player once", async gameId => {
    const users = [await player(), await player()];
    for (let index = 0; index < users.length; index++) {
      await framework.matchmakingManager.joinQueue({
        playerId: users[index].id, gameId, stake: 100,
        socket: makeSocket(`s-${users[index].id}`), mode: "casual",
      });
    }
    const room = framework.roomManager.getPlayerRoom(users[0].id)!;
    expect(room?.status).toBe("playing");
    const matchId = room.match!.matchId;
    const persisted = await prisma.room.findUniqueOrThrow({ where: { id: room.id }, include: { players: true, match: true } });
    expect(persisted.code).toBe(room.code);
    expect(persisted.hostId).toBe(users[0].id);
    expect(persisted.status).toBe("PLAYING");
    expect(persisted.players.map(p => p.userId).sort()).toEqual(users.map(p => p.id).sort());
    expect(persisted.match).toMatchObject({ id: matchId, gameId, roomId: room.id, status: "ACTIVE", stake: 100 });
    expect(framework.matchmakingManager.getQueueLength()).toBe(0);

    // An HTTP retry uses the same match identity; no second room or debit.
    await api.createAndFundRoomMatch(room, matchId);
    expect(await prisma.match.count({ where: { id: matchId } })).toBe(1);
    for (const user of users) {
      const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
      expect(wallet.balance).toBe(900);
      expect(await prisma.transaction.count({ where: { userId: user.id, referenceId: matchId, referenceType: "MATCH_WAGER", type: "DEBIT", amount: 100 } })).toBe(1);
    }
  });

  it("rolls back room, match, and prior player debit when another participant lacks funds", async () => {
    const users = [await player(), await player(0)];
    const room = await framework.roomManager.createRoom({
      gameId: "bubble-shooter", hostId: users[0].id, hostSocket: makeSocket("host"), stake: 100, maxPlayers: 2,
    });
    await framework.roomManager.joinRoom({ roomId: room.id, playerId: users[1].id, socket: makeSocket("guest") });
    for (const participant of room.players.values()) participant.isReady = true;
    await expect(api.createAndFundRoomMatch(room, randomUUID())).rejects.toThrow("Insufficient balance");
    expect(await prisma.room.count({ where: { id: room.id } })).toBe(0);
    expect(await prisma.match.count({ where: { roomId: room.id } })).toBe(0);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: users[0].id } })).balance).toBe(1000);
    expect(await prisma.transaction.count({ where: { userId: { in: users.map(p => p.id) }, type: "DEBIT" } })).toBe(0);
  });

  it("keeps room creation protected by the internal service key", async () => {
    const response = await app.inject({ method: "POST", url: "/internal/matches/create-and-fund", payload: {} });
    expect(response.statusCode).toBe(401);
    expect(env.INTERNAL_API_KEY.length).toBeGreaterThanOrEqual(8);
  });

  it("refuses to overwrite an existing room belonging to a different host", async () => {
    const users = [await player(), await player()];
    const owner = await createTestUser();
    const room = await framework.roomManager.createRoom({
      gameId: "chess", hostId: users[0].id, hostSocket: makeSocket("host"), stake: 100, maxPlayers: 2,
    });
    await framework.roomManager.joinRoom({ roomId: room.id, playerId: users[1].id, socket: makeSocket("guest") });
    await prisma.room.create({ data: {
      id: room.id, code: room.code, hostId: owner.id, gameId: "chess", stake: 100, minPlayers: 2, maxPlayers: 2,
    } });
    await expect(api.createAndFundRoomMatch(room, randomUUID())).rejects.toThrow("room identity");
    expect((await prisma.room.findUniqueOrThrow({ where: { id: room.id } })).hostId).toBe(owner.id);
    expect(await prisma.match.count({ where: { roomId: room.id } })).toBe(0);
    for (const user of users) expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(1000);
  });

  it("continues to fund an already persisted room without a snapshot", async () => {
    const users = [await player(), await player()];
    const room = await prisma.room.create({ data: {
      code: "EXIST1", hostId: users[0].id, gameId: "chess", stake: 100, minPlayers: 2, maxPlayers: 2,
      players: { create: users.map((user, seat) => ({ userId: user.id, seat, isHost: seat === 0 })) },
    } });
    const matchId = randomUUID();
    await api.createAndFundMatch({ matchId, roomId: room.id, gameId: "chess", stake: 100,
      players: users.map((user, seat) => ({ userId: user.id, seat })) });
    expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).roomId).toBe(room.id);
    for (const user of users) expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(900);
  });
});
