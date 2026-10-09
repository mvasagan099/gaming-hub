import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@gaming-hub/db";
import { MultiplayerFramework } from "@gaming-hub/multiplayer";
import { DEFAULT_GAME_CONFIGS } from "@gaming-hub/shared";
import { createIoStub, makeSocket } from "../../../../../packages/multiplayer/__tests__/helpers";
import { createTestUser } from "../../../test/helpers";
import { resetTestDatabase } from "../../../test/db";

// Only JWT cryptography is stubbed; account/session/MFA and feature settings
// use the real production services and the disposable PostgreSQL database.
const verification = vi.hoisted(() => ({ jwtVerify: vi.fn() }));
vi.mock("jose", async original => ({ ...await original<typeof import("jose")>(), jwtVerify: verification.jwtVerify }));
import { hashToken } from "../../../../socket-server/src/auth";
import { requestSocketRematch, declineSocketRematch } from "../../../../socket-server/src/rematch";
import { applySocketGameAction } from "../../../../socket-server/src/gameActions";
import { invalidateSocketConfigCache } from "../../../../socket-server/src/settings";

describe("socket rematch security entry point", () => {
  let framework: MultiplayerFramework;
  let userId: string;
  let roomId: string;
  const token = "local-rematch-jwt-fixture";

  beforeEach(async () => {
    await resetTestDatabase();
    invalidateSocketConfigCache();
    MultiplayerFramework.resetInstance();
    framework = MultiplayerFramework.getInstance({ io: createIoStub(), enableReplay: false });
    const user = await createTestUser({ email: "rematch-user@test.local" });
    const opponent = await createTestUser();
    userId = user.id;
    verification.jwtVerify.mockReset().mockResolvedValue({ payload: { sub: userId, email: "rematch-user@test.local", email_verified: true, exp: Math.floor(Date.now() / 1000) + 60 } });
    await prisma.loginSession.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });
    const room = await framework.roomManager.createRoom({ gameId: "chess", hostId: userId, hostSocket: makeSocket("s1"), stake: 100, maxPlayers: 2 });
    await framework.roomManager.joinRoom({ roomId: room.id, playerId: opponent.id, socket: makeSocket("s2") });
    room.players.get(opponent.id)!.isReady = true;
    await framework.matchManager.startMatch({ roomId: room.id, startedBy: userId });
    await framework.matchManager.finishMatch(room, { ok: true, finished: true, winnerSeats: [], state: framework.gameStateManager.getState(room), events: [] });
    roomId = room.id;
  });
  afterEach(async () => { await framework.shutdown(); invalidateSocketConfigCache(); vi.restoreAllMocks(); });

  it("revalidates the authenticated identity before recording a vote", async () => {
    expect(await requestSocketRematch(framework, roomId, userId, token)).toMatchObject({ active: true, requestedBy: [userId] });
    expect(verification.jwtVerify).toHaveBeenCalledOnce();
  });

  it.each(["revoked", "expired", "MFA pending", "deleted", "banned", "invalid JWT"])("rejects a %s session on an already connected socket", async condition => {
    if (condition === "revoked") await prisma.loginSession.update({ where: { tokenHash: hashToken(token) }, data: { revokedAt: new Date() } });
    if (condition === "expired") await prisma.loginSession.update({ where: { tokenHash: hashToken(token) }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    if (condition === "MFA pending") await prisma.profile.update({ where: { userId }, data: { twoFactorEnabled: true } });
    if (condition === "deleted") await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
    if (condition === "banned") await prisma.playerPenalty.create({ data: { userId, type: "CHEATING", status: "ACTIVE", reason: "Disposable security fixture" } });
    if (condition === "invalid JWT") verification.jwtVerify.mockRejectedValue(new Error("JWT_EXPIRED"));
    await expect(requestSocketRematch(framework, roomId, userId, token)).rejects.toThrow();
    expect(framework.roomManager.getRoom(roomId)!.rematch).toBeNull();
  });

  it("rejects a verified token that does not match the connection identity", async () => {
    await expect(requestSocketRematch(framework, roomId, "different-identity", token)).rejects.toThrow("UNAUTHORIZED");
    expect(framework.roomManager.getRoom(roomId)!.rematch).toBeNull();
  });

  it("rejects a missing token or spectator without recording consent", async () => {
    await expect(requestSocketRematch(framework, roomId, userId, undefined)).rejects.toThrow("UNAUTHORIZED");
    framework.roomManager.getRoom(roomId)!.players.get(userId)!.isSpectator = true;
    await expect(requestSocketRematch(framework, roomId, userId, token)).rejects.toThrow("UNAUTHORIZED");
    expect(framework.roomManager.getRoom(roomId)!.rematch).toBeNull();
  });

  it.each(["games.realMoney", "games.practice"])("respects the %s shutdown flag before accepting a rematch", async flag => {
    if (flag === "games.practice") framework.roomManager.getRoom(roomId)!.config.stake = 0;
    await prisma.siteSetting.upsert({ where: { key: "developer.featureFlags" },
      create: { category: "developer", key: "developer.featureFlags", value: { [flag]: false } },
      update: { value: { [flag]: false } },
    });
    invalidateSocketConfigCache();
    await expect(requestSocketRematch(framework, roomId, userId, token)).rejects.toThrow("disabled");
    expect(framework.roomManager.getRoom(roomId)!.rematch).toBeNull();
  });

  it.each(["enabled", "onlineEnabled"])("respects a disabled game %s setting", async field => {
    const value = JSON.parse(JSON.stringify({ ...DEFAULT_GAME_CONFIGS.chess, [field]: false }));
    await prisma.siteSetting.upsert({ where: { key: "game_config.chess" },
      create: { category: "game_config", key: "game_config.chess", value }, update: { value },
    });
    invalidateSocketConfigCache();
    await expect(requestSocketRematch(framework, roomId, userId, token)).rejects.toThrow("disabled");
    expect(framework.roomManager.getRoom(roomId)!.rematch).toBeNull();
  });

  it("allows an authenticated participant to cancel without disabling the safety checks", async () => {
    await requestSocketRematch(framework, roomId, userId, token);
    expect(await declineSocketRematch(framework, roomId, userId, token)).toMatchObject({ active: false });
    expect(framework.roomManager.getRoom(roomId)!.rematch).toBeNull();
  });

  it("does not let a revoked session cancel another participant's offer", async () => {
    await requestSocketRematch(framework, roomId, userId, token);
    await prisma.loginSession.update({ where: { tokenHash: hashToken(token) }, data: { revokedAt: new Date() } });
    await expect(declineSocketRematch(framework, roomId, userId, token)).rejects.toThrow("SESSION_REVOKED");
    expect(framework.roomManager.getRoom(roomId)!.rematch?.requestedBy).toEqual([userId]);
  });

  it("requires current match identity at the socket action boundary", async () => {
    const room = framework.roomManager.getRoom(roomId)!;
    const oldId = room.match!.matchId;
    await framework.matchManager.requestRematch(roomId, userId);
    const opponentId = [...room.players.keys()].find(id => id !== userId)!;
    await framework.matchManager.requestRematch(roomId, opponentId);
    const action = { type: "move", from: "e2", to: "e4", actionId: "opening" };
    expect(() => applySocketGameAction(framework, userId, { roomId, action } as never)).toThrow("Current match identity");
    expect((await applySocketGameAction(framework, userId, { roomId, matchId: oldId, action })).ok).toBe(false);
    expect(room.match!.actionHistory).toEqual([]);
    expect((await applySocketGameAction(framework, userId, { roomId, matchId: room.match!.matchId, action })).ok).toBe(true);
    expect(room.match!.actionHistory).toHaveLength(1);
  });

  it("uses the authenticated actor rather than a player ID supplied in an action payload", async () => {
    const room = framework.roomManager.getRoom(roomId)!;
    const opponentId = [...room.players.keys()].find(id => id !== userId)!;
    await framework.matchManager.requestRematch(roomId, userId);
    await framework.matchManager.requestRematch(roomId, opponentId);
    const result = await applySocketGameAction(framework, opponentId, {
      roomId, matchId: room.match!.matchId,
      action: { type: "move", from: "e2", to: "e4", playerId: userId },
    });
    expect(result.ok).toBe(false);
    expect(room.match!.actionHistory).toEqual([]);
  });
});
