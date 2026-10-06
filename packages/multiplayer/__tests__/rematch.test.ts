import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_IDS, type GameId } from "@gaming-hub/shared";
import { MultiplayerFramework } from "../src/framework";
import { createTestFramework, makeSocket } from "./helpers";

describe("authoritative rematches", () => {
  let framework: MultiplayerFramework;
  beforeEach(() => {
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({ enableReplay: false });
  });
  afterEach(async () => { await framework.shutdown(); MultiplayerFramework.resetInstance(); vi.restoreAllMocks(); });

  async function endedRoom(gameId: GameId = "chess") {
    const room = await framework.roomManager.createRoom({ gameId, hostId: "p1", hostSocket: makeSocket("s1"), maxPlayers: 2 });
    await framework.roomManager.joinRoom({ roomId: room.id, playerId: "p2", socket: makeSocket("s2") });
    await framework.roomManager.setPlayerReady(room.id, "p2", true);
    await framework.matchManager.startMatch({ roomId: room.id, startedBy: "p1" });
    await framework.matchManager.finishMatch(room, { ok: true, state: framework.gameStateManager.getState(room), events: [], finished: true, winnerSeats: [] });
    return room;
  }

  it.each(GAME_IDS)("starts a fresh %s engine after both players consent, preserving seats", async gameId => {
    const room = await endedRoom(gameId);
    const previous = room.match!;
    const seats = [...room.players.values()].map(p => [p.id, p.seat]);
    const fund = vi.fn().mockResolvedValue(undefined);
    framework.config.onMatchStarting = fund;
    expect(await framework.matchManager.requestRematch(room.id, "p1")).toMatchObject({ requestedBy: ["p1"], active: true });
    await framework.matchManager.requestRematch(room.id, "p1");
    expect(fund).not.toHaveBeenCalled();
    expect(room.match).toBe(previous);
    expect(await framework.matchManager.requestRematch(room.id, "p2")).toMatchObject({ requestedBy: [], active: false });
    expect(fund).toHaveBeenCalledOnce();
    expect(room.status).toBe("playing");
    expect(room.match!.matchId).not.toBe(previous.matchId);
    expect(room.match!.engine).not.toBe(previous.engine);
    expect(room.match!.finishedAt).toBeNull();
    expect(framework.gameStateManager.isFinished(room)).toBe(false);
    expect(room.match!.actionHistory).toEqual([]);
    expect(room.match!.winnerIds).toEqual([]);
    expect(room.eventLog).toEqual([]);
    expect(room.rematch).toBeNull();
    expect([...room.players.values()].map(p => [p.id, p.seat])).toEqual(seats);
    expect(framework.matchManager.getMatch(previous.matchId)).toBeUndefined();
  });

  it("serializes simultaneous votes and retries so only one match is funded", async () => {
    const room = await endedRoom();
    framework.config.onMatchStarting = vi.fn().mockResolvedValue(undefined);
    const results = await Promise.allSettled([
      framework.matchManager.requestRematch(room.id, "p1"),
      framework.matchManager.requestRematch(room.id, "p2"),
      framework.matchManager.requestRematch(room.id, "p2"),
    ]);
    expect(framework.config.onMatchStarting).toHaveBeenCalledOnce();
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(2);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  });

  it("keeps the previous result and lets players retry after failed funding", async () => {
    const room = await endedRoom();
    const previous = room.match;
    framework.config.onMatchStarting = vi.fn().mockRejectedValue(new Error("Insufficient balance"));
    await framework.matchManager.requestRematch(room.id, "p1");
    await expect(framework.matchManager.requestRematch(room.id, "p2")).rejects.toThrow("Insufficient balance");
    expect(room.status).toBe("ended");
    expect(room.match).toBe(previous);
    expect(room.rematch).toBeNull();
    framework.config.onMatchStarting = vi.fn().mockResolvedValue(undefined);
    await framework.matchManager.requestRematch(room.id, "p1");
    await framework.matchManager.requestRematch(room.id, "p2");
    expect(room.status).toBe("playing");
  });

  it("does not count expired consent", async () => {
    const room = await endedRoom();
    await framework.matchManager.requestRematch(room.id, "p1");
    room.rematch!.expiresAt = Date.now() - 1;
    expect(await framework.matchManager.requestRematch(room.id, "p2")).toMatchObject({ requestedBy: ["p2"], active: true });
    expect(room.status).toBe("ended");
  });

  it("cancels the offer without counting the previous votes on the next request", async () => {
    const room = await endedRoom();
    await framework.matchManager.requestRematch(room.id, "p1");
    await expect(framework.matchManager.declineRematch(room.id, "outsider")).rejects.toThrow("UNAUTHORIZED");
    expect(await framework.matchManager.declineRematch(room.id, "p2")).toMatchObject({ active: false, requestedBy: [] });
    expect(await framework.matchManager.requestRematch(room.id, "p2")).toMatchObject({ active: true, requestedBy: ["p2"] });
    expect(room.status).toBe("ended");
    await framework.matchManager.requestRematch(room.id, "p1");
    await expect(framework.matchManager.declineRematch(room.id, "p2")).rejects.toThrow("already started");
    expect(room.status).toBe("playing");
  });

  it("rejects spectators, outsiders, disconnected players, active games and tournament replay", async () => {
    const room = await endedRoom();
    await expect(framework.matchManager.requestRematch(room.id, "outsider")).rejects.toThrow("UNAUTHORIZED");
    room.players.get("p2")!.isSpectator = true;
    await expect(framework.matchManager.requestRematch(room.id, "p2")).rejects.toThrow("UNAUTHORIZED");
    room.players.get("p2")!.isSpectator = false;
    room.players.get("p2")!.connectionStatus = "disconnected";
    await expect(framework.matchManager.requestRematch(room.id, "p1")).rejects.toThrow("connected");
    room.players.get("p2")!.connectionStatus = "connected";
    room.status = "playing";
    await expect(framework.matchManager.requestRematch(room.id, "p1")).rejects.toThrow("ended");
    room.status = "ended";
    room.config.settings.tournamentId = "tournament-1";
    await expect(framework.matchManager.requestRematch(room.id, "p1")).rejects.toThrow("Tournament");
  });

  it("does not reuse an earlier match's cached action after a rematch", async () => {
    const room = await endedRoom();
    await framework.matchManager.requestRematch(room.id, "p1");
    await framework.matchManager.requestRematch(room.id, "p2");
    const action = { type: "move", from: "e2", to: "e4", actionId: "first-move" };
    expect((await framework.matchManager.applyAction({ roomId: room.id, playerId: "p1", action })).ok).toBe(true);
    await framework.matchManager.finishMatch(room, { ok: true, state: framework.gameStateManager.getState(room), events: [], finished: true, winnerSeats: [] });
    await framework.matchManager.requestRematch(room.id, "p1");
    await framework.matchManager.requestRematch(room.id, "p2");
    // The synthetic finish above takes no real match time. Advance past the
    // normal action cooldown without disabling the production rate limiter.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1_000);
    expect((await framework.matchManager.applyAction({ roomId: room.id, playerId: "p1", action })).ok).toBe(true);
    expect(room.match!.turnNumber).toBe(1);
    expect(room.match!.actionHistory).toHaveLength(1);
  });

  it("does not give one participant another participant's cached action result", async () => {
    const room = await endedRoom();
    await framework.matchManager.requestRematch(room.id, "p1");
    await framework.matchManager.requestRematch(room.id, "p2");
    const first = await framework.matchManager.applyAction({ roomId: room.id, playerId: "p1", action: { type: "move", from: "e2", to: "e4", actionId: "shared-id" } });
    expect(first.ok).toBe(true);
    const second = await framework.matchManager.applyAction({ roomId: room.id, playerId: "p2", action: { type: "move", from: "e7", to: "e5", actionId: "shared-id" } });
    expect(second.ok).toBe(true);
    expect(room.match!.turnNumber).toBe(2);
    expect(room.match!.actionHistory.map(a => a.playerId)).toEqual(["p1", "p2"]);
  });

  it("applies concurrent duplicate action IDs only once within the same match", async () => {
    const room = await endedRoom();
    await framework.matchManager.requestRematch(room.id, "p1");
    await framework.matchManager.requestRematch(room.id, "p2");
    const options = { roomId: room.id, playerId: "p1", action: { type: "move", from: "e2", to: "e4", actionId: "retry" } };
    const results = await Promise.all([framework.matchManager.applyAction(options), framework.matchManager.applyAction(options)]);
    expect(results.every(result => result.ok)).toBe(true);
    expect(results[0]).toEqual(results[1]);
    expect(room.match!.turnNumber).toBe(1);
    expect(room.match!.actionHistory).toHaveLength(1);
  });

  it("rejects a queued action when its player leaves before execution", async () => {
    const room = await endedRoom();
    await framework.matchManager.requestRematch(room.id, "p1");
    await framework.matchManager.requestRematch(room.id, "p2");
    let release!: () => void;
    const block = framework.gameStateManager.enqueue(room.id, () => new Promise<void>(resolve => { release = resolve; }));
    await Promise.resolve();
    const action = framework.matchManager.applyAction({ roomId: room.id, playerId: "p1", action: { type: "move", from: "e2", to: "e4" } });
    room.players.delete("p1");
    release();
    await block;
    expect((await action).ok).toBe(false);
    expect(room.match!.turnNumber).toBe(0);
    expect(room.match!.actionHistory).toEqual([]);
  });

  it("rejects a delayed action addressed to the previous match", async () => {
    const room = await endedRoom();
    const oldId = room.match!.matchId;
    await framework.matchManager.requestRematch(room.id, "p1");
    await framework.matchManager.requestRematch(room.id, "p2");
    const result = await framework.matchManager.applyAction({
      roomId: room.id, playerId: "p1", matchId: oldId,
      action: { type: "move", from: "e2", to: "e4" },
    } as Parameters<typeof framework.matchManager.applyAction>[0]);
    expect(result.ok).toBe(false);
    expect(room.match!.turnNumber).toBe(0);
    expect(room.match!.actionHistory).toEqual([]);
  });
});
