import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MultiplayerFramework } from "../src/framework";
import type { Socket } from "socket.io";
import { createTestFramework, makePlayer, createMatchRoom } from "./helpers";

function makeSocket(id: string): Socket {
  return { id, connected: true, join: () => undefined, emit: () => undefined } as unknown as Socket;
}

describe("DisconnectHandler", () => {
  let framework: MultiplayerFramework;

  beforeEach(() => {
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({ enableAntiCheat: false });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    void framework.shutdown().catch(() => undefined);
  });

  it("auto-pauses a turn-based match when a player disconnects", async () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("chess", [p1, p2]);

    await framework.disconnectHandler.handleDisconnect(room, p2);

    expect(room.match!.pausedAt).not.toBeNull();
    expect(room.match!.pausedBy).toBe("p2");
  });

  it("arms a reconnect grace timer that forfeits the player on expiry", async () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("chess", [p1, p2]);

    const forfeitSpy = vi
      .spyOn(framework.matchManager, "handlePlayerForfeit")
      .mockResolvedValue(undefined);

    await framework.disconnectHandler.handleDisconnect(room, p2);

    const timerKey = `${room.id}:reconnect:${p2.id}`;
    expect(framework.timerManager.getTimerInfo(timerKey)).not.toBeNull();

    await vi.advanceTimersByTimeAsync(90_000);

    expect(forfeitSpy).toHaveBeenCalledTimes(1);
    expect(forfeitSpy).toHaveBeenCalledWith(room, p2, "disconnect_timeout");
  });

  it("does nothing when no match is running", async () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("chess", [p1, p2]);
    room.match = null;
    room.status = "waiting";

    const forfeitSpy = vi
      .spyOn(framework.matchManager, "handlePlayerForfeit")
      .mockResolvedValue(undefined);

    await framework.disconnectHandler.handleDisconnect(room, p2);
    expect(forfeitSpy).not.toHaveBeenCalled();
    expect(room.match).toBeNull();
  });
});

describe("ReconnectHandler", () => {
  let framework: MultiplayerFramework;

  beforeEach(() => {
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({ enableAntiCheat: false });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    void framework.shutdown().catch(() => undefined);
  });

  it("cancels the forfeit timer and auto-resumes a paused match", async () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("chess", [p1, p2]);

    await framework.disconnectHandler.handleDisconnect(room, p2);
    expect(room.match!.pausedAt).not.toBeNull();

    // PlayerManager.handleReconnect marks the player connected and attaches
    // the fresh socket before delegating to the reconnect handler.
    p2.connectionStatus = "connected";
    p2.socketIds.add("socket-new");

    const resumeSpy = vi
      .spyOn(framework.matchManager, "resumeMatch")
      .mockImplementation(async () => {
        // Mirror resumeMatch's visible effect without needing the room to be
        // registered in the framework's RoomManager.
        room.match!.pausedAt = null;
        room.match!.pausedBy = null;
      });
    const socket = makeSocket("socket-new");

    await framework.reconnectHandler.handleReconnect(room, p2, socket);

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(resumeSpy).toHaveBeenCalledWith(room.id, "p2", true);
    expect(framework.timerManager.getTimerInfo(`${room.id}:reconnect:${p2.id}`)).toBeNull();
    expect(room.match!.pausedAt).toBeNull();
  });

  it("does not auto-resume while other participants are still disconnected", async () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("chess", [p1, p2]);

    await framework.disconnectHandler.handleDisconnect(room, p2);

    const resumeSpy = vi.spyOn(framework.matchManager, "resumeMatch");
    const socket = makeSocket("socket-new");

    p2.connectionStatus = "disconnected";
    await framework.reconnectHandler.handleReconnect(room, p2, socket);

    expect(resumeSpy).not.toHaveBeenCalled();
    expect(room.match!.pausedAt).not.toBeNull();
  });
});
