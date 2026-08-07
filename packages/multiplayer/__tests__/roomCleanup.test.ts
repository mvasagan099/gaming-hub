import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MultiplayerFramework } from "../src/framework";
import { createTestFramework, makeSocket } from "./helpers";

async function setupPlayingChessRoom(framework: MultiplayerFramework): Promise<string> {
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
  await framework.matchManager.startMatch({ roomId: room.id, startedBy: "p1" });
  return room.id;
}

describe("Room cleanup after a match ends", () => {
  let framework: MultiplayerFramework;

  beforeEach(() => {
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({
      enableAntiCheat: true,
      enableReplay: false,
      roomExpirationMs: 60_000,
      endedRoomLingerMs: 60_000,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    void framework.shutdown().catch(() => undefined);
  });

  it("closes the room after the linger window once the match finishes", async () => {
    const roomId = await setupPlayingChessRoom(framework);
    expect(framework.roomManager.getRoomCount()).toBe(1);

    await framework.matchManager.applyAction({
      roomId,
      playerId: "p2",
      action: { type: "resign", reason: "gave up" },
    });

    const room = framework.roomManager.getRoom(roomId)!;
    expect(room.status).toBe("ended");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(framework.roomManager.getRoomCount()).toBe(0);
  });

  it("closes the room after the linger window once the match is aborted", async () => {
    const roomId = await setupPlayingChessRoom(framework);
    const room = framework.roomManager.getRoom(roomId)!;

    await framework.matchManager.abortMatch(room, "player_timeout");
    expect(room.status).toBe("ended");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(framework.roomManager.getRoomCount()).toBe(0);
  });

  it("keeps the room open when a rematch resets it before the linger expires", async () => {
    const roomId = await setupPlayingChessRoom(framework);

    await framework.matchManager.applyAction({
      roomId,
      playerId: "p2",
      action: { type: "resign", reason: "gave up" },
    });

    // Mirror the socket-server rematch-accept reset.
    const room = framework.roomManager.getRoom(roomId)!;
    room.status = "waiting";
    room.match = null;
    room.rematch = null;

    await vi.advanceTimersByTimeAsync(120_000);
    expect(framework.roomManager.getRoom(roomId)).not.toBeNull();
  });

  it("does not expire a playing room when the creation expiration timer fires", async () => {
    const roomId = await setupPlayingChessRoom(framework);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(framework.roomManager.getRoom(roomId)).not.toBeNull();
    expect(framework.roomManager.getRoom(roomId)!.status).toBe("playing");
  });
});
