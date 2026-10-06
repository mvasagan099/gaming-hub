import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MultiplayerFramework } from "../src/framework";
import type { Socket } from "socket.io";
import { createTestFramework } from "./helpers";

function makeSocket(id: string): Socket {
  return {
    id,
    connected: true,
    data: { user: { username: `user-${id}`, displayName: `User ${id}`, avatarUrl: null } },
    join: () => undefined,
    leave: () => undefined,
    emit: () => undefined,
  } as unknown as Socket;
}

async function setupChessRoom(framework: MultiplayerFramework): Promise<string> {
  const room = await framework.roomManager.createRoom({
    gameId: "chess",
    hostId: "p1",
    hostSocket: makeSocket("s1"),
    settings: {},
  });
  await framework.roomManager.joinRoom({
    roomId: room.id,
    playerId: "p2",
    socket: makeSocket("s2"),
  });
  await framework.roomManager.setPlayerReady(room.id, "p2", true);
  return room.id;
}

describe("MatchManager pipeline", () => {
  let framework: MultiplayerFramework;

  beforeEach(() => {
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({ enableAntiCheat: true, enableReplay: false });
  });

  afterEach(async () => {
    await framework.shutdown();
  });

  it("starts a match and applies a legal move through the full pipeline", async () => {
    const roomId = await setupChessRoom(framework);

    await framework.matchManager.startMatch({ roomId, startedBy: "p1" });

    const room = framework.roomManager.getRoom(roomId)!;
    expect(room.status).toBe("playing");
    expect(room.match).not.toBeNull();

    const result = await framework.matchManager.applyAction({
      roomId,
      playerId: "p1",
      action: { type: "move", from: "e2", to: "e4" },
    });

    expect(result.ok).toBe(true);
    expect(room.match!.turnNumber).toBe(1);
    expect(room.match!.actionHistory).toHaveLength(1);
    expect(room.match!.actionHistory[0].playerId).toBe("p1");
    expect(room.eventLog.length).toBeGreaterThan(0);
    expect(room.eventLog.some((e) => e.type === "move")).toBe(true);

    const stats = framework.statisticsCollector.getMatchStats(room.id, "p1");
    expect(stats).not.toBeNull();
    expect(stats!.movesMade).toBe(1);
  });

  it("broadcasts a room update so non-host clients see the room move to playing", async () => {
    const roomId = await setupChessRoom(framework);

    const roomUpdateSpy = vi.spyOn(framework.syncManager, "broadcastRoomUpdate");

    await framework.matchManager.startMatch({ roomId, startedBy: "p1" });

    expect(roomUpdateSpy).toHaveBeenCalledTimes(1);
    const broadcastRoom = roomUpdateSpy.mock.calls[0][0];
    expect(broadcastRoom.status).toBe("playing");
    expect(broadcastRoom.match?.matchId).toBeTruthy();
  });

  it("does not publish a playing match until funding succeeds", async () => {
    const roomId = await setupChessRoom(framework);
    const room = framework.roomManager.getRoom(roomId)!;
    let finishFunding!: () => void;
    const funding = new Promise<void>(resolve => { finishFunding = resolve; });
    framework.config.onMatchStarting = vi.fn(async () => { await funding; });
    const broadcast = vi.spyOn(framework.syncManager, "broadcastMatchStart");
    const monitor = vi.spyOn(framework.playerManager, "startAfkMonitoring");
    const starting = framework.matchManager.startMatch({ roomId, startedBy: "p1" });
    await vi.waitFor(() => expect(framework.config.onMatchStarting).toHaveBeenCalledOnce());
    expect(room.status).toBe("starting");
    expect(room.match).toBeNull();
    expect(broadcast).not.toHaveBeenCalled();
    expect(monitor).not.toHaveBeenCalled();
    await expect(framework.matchManager.startMatch({ roomId, startedBy: "p1" })).rejects.toThrow("Match already started");
    finishFunding();
    await starting;
    expect(room.status).toBe("playing");
    expect(broadcast).toHaveBeenCalledOnce();
  });

  it("funds only one match when two start requests arrive together", async () => {
    const roomId = await setupChessRoom(framework);
    const funding = vi.fn().mockResolvedValue(undefined);
    framework.config.onMatchStarting = funding;
    const results = await Promise.allSettled([
      framework.matchManager.startMatch({ roomId, startedBy: "p1" }),
      framework.matchManager.startMatch({ roomId, startedBy: "p1" }),
    ]);
    expect(funding).toHaveBeenCalledOnce();
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });

  it("does not cancel an uncreated database match when funding fails", async () => {
    const roomId = await setupChessRoom(framework);
    const room = framework.roomManager.getRoom(roomId)!;
    framework.config.onMatchStarting = vi.fn().mockRejectedValue(new Error("funding failed"));
    const abort = vi.spyOn(framework.matchManager, "abortMatch");
    const monitor = vi.spyOn(framework.playerManager, "startAfkMonitoring");
    await expect(framework.matchManager.startMatch({ roomId, startedBy: "p1" })).rejects.toThrow("funding failed");
    expect(room.status).toBe("waiting");
    expect(room.match).toBeNull();
    expect(monitor).not.toHaveBeenCalled();
    framework.roomManager.closeRoom(roomId, "matchmaking_failed");
    expect(abort).not.toHaveBeenCalled();
  });

  it("rejects out-of-turn and spectator actions in the pipeline", async () => {
    const roomId = await setupChessRoom(framework);
    await framework.matchManager.startMatch({ roomId, startedBy: "p1" });
    const room = framework.roomManager.getRoom(roomId)!;
    const authoritativeBefore = JSON.stringify(room.match!.engine.serialize());

    const outOfTurn = await framework.matchManager.applyAction({
      roomId,
      playerId: "p2",
      action: { type: "move", from: "e7", to: "e5" },
    });
    expect(outOfTurn.ok).toBe(false);
    expect(outOfTurn.error).toContain("not your turn");
    expect(JSON.stringify(room.match!.engine.serialize())).toBe(authoritativeBefore);

    await framework.roomManager.joinRoom({
      roomId,
      playerId: "spec",
      socket: makeSocket("s3"),
      asSpectator: true,
    });
    const spectator = await framework.matchManager.applyAction({
      roomId,
      playerId: "spec",
      action: { type: "move", from: "e2", to: "e4" },
    });
    // Spectators live in room.spectators, so the pipeline rejects them before
    // any game-level validation (the ActionValidator's spectator gate is
    // defense-in-depth, covered by unit tests).
    expect(spectator.ok).toBe(false);
    expect(spectator.error).toBe("Player not in room");
    expect(JSON.stringify(room.match!.engine.serialize())).toBe(authoritativeBefore);
  });

  it("resolves a finish through the winner calculator", async () => {
    const roomId = await setupChessRoom(framework);
    await framework.matchManager.startMatch({ roomId, startedBy: "p1" });

    const finalizeSpy = vi
      .spyOn(framework.statisticsCollector, "finalize")
      .mockResolvedValue(undefined);

    const result = await framework.matchManager.applyAction({
      roomId,
      playerId: "p2",
      action: { type: "resign", reason: "gave up" },
    });

    expect(result.ok).toBe(true);
    expect(result.finished).toBe(true);
    expect(result.winnerSeats).toEqual([0]);

    const room = framework.roomManager.getRoom(roomId)!;
    expect(room.status).toBe("ended");
    expect(room.match!.finishedAt).not.toBeNull();
    expect(room.match!.winnerIds).toEqual(["p1"]);

    expect(finalizeSpy).toHaveBeenCalledTimes(1);
    const matchResult = finalizeSpy.mock.calls[0][1];
    expect(matchResult.winnerIds).toEqual(["p1"]);
    expect(matchResult.players.find((p) => p.playerId === "p2")!.outcome).toBe("lost");
  });
});
