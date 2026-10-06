import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MultiplayerFramework } from "../src/framework";
import { createTestFramework, makeSocket } from "./helpers";
import { GAME_IDS } from "@gaming-hub/shared";

describe("MatchmakingManager", () => {
  let framework: MultiplayerFramework;

  beforeEach(() => {
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({ enableAntiCheat: true, enableReplay: false });
  });

  afterEach(async () => {
    await framework.shutdown();
  });

  function joinChessQueue(playerId: string, socketId: string): Promise<unknown> {
    return framework.matchmakingManager.joinQueue({
      playerId,
      gameId: "chess",
      stake: 10,
      socket: makeSocket(socketId),
      mode: "quick",
    });
  }

  it.each(GAME_IDS)("waits for a second distinct player in %s", async (gameId) => {
    const result = await framework.matchmakingManager.joinQueue({
      playerId: "p1", gameId, stake: 0, socket: makeSocket("s1"), mode: "casual",
    });
    expect(result).toMatchObject({ success: true, position: 1 });
    expect(framework.roomManager.getRoomCount()).toBe(0);
    expect(framework.matchmakingManager.isInQueue("p1")).toBe(true);

    const duplicate = await framework.matchmakingManager.joinQueue({
      playerId: "p1", gameId, stake: 0, socket: makeSocket("another-device"), mode: "casual",
    });
    expect(duplicate.success).toBe(false);
    expect(framework.matchmakingManager.getQueueLength()).toBe(1);
  });

  it.each(GAME_IDS)("starts %s for two distinct players in the same queue", async (gameId) => {
    const sockets = [makeSocket("s1"), makeSocket("s2")];
    const found = sockets.map(socket => vi.spyOn(socket, "emit"));
    for (let index = 0; index < sockets.length; index++) {
      await framework.matchmakingManager.joinQueue({
        playerId: `p${index + 1}`, gameId, stake: 0, socket: sockets[index], mode: "casual",
      });
    }
    const room = framework.roomManager.getPlayerRoom("p1")!;
    expect(room).toBeDefined();
    expect(room.config.gameId).toBe(gameId);
    expect(room.status).toBe("playing");
    expect(room.match).not.toBeNull();
    expect([...room.players.values()].map(player => player.seat).sort()).toEqual([0, 1]);
    expect(framework.roomManager.getPlayerRoom("p2")).toBe(room);
    expect(framework.matchmakingManager.getQueueLength()).toBe(0);
    for (const emit of found) {
      expect(emit).toHaveBeenCalledWith("matchmaking:found", { roomId: room.id, code: room.code });
    }
  });

  it("pairs enough players and auto-starts the match in a ready room", async () => {
    await joinChessQueue("p1", "s1");
    expect(framework.roomManager.getRoomCount()).toBe(0);

    await joinChessQueue("p2", "s2");

    expect(framework.roomManager.getRoomCount()).toBe(1);
    const room = framework.roomManager.getPlayerRoom("p1")!;
    expect(room.status).toBe("playing");
    expect(room.match).not.toBeNull();
    for (const player of room.players.values()) {
      expect(player.isReady).toBe(true);
    }
    // Both players were pulled out of the queue.
    expect(framework.matchmakingManager.isInQueue("p1")).toBe(false);
    expect(framework.matchmakingManager.isInQueue("p2")).toBe(false);
  });

  it("closes the room instead of leaking it when auto-start fails", async () => {
    vi.spyOn(framework.matchManager, "startMatch").mockRejectedValue(
      new Error("boom"),
    );

    await joinChessQueue("p1", "s1");
    await joinChessQueue("p2", "s2");

    // The half-created room must be closed, not left open in "waiting".
    expect(framework.roomManager.getRoomCount()).toBe(0);

    // The players are returned to the queue so they can retry.
    expect(framework.matchmakingManager.isInQueue("p1")).toBe(true);
    expect(framework.matchmakingManager.isInQueue("p2")).toBe(true);
  });
});
