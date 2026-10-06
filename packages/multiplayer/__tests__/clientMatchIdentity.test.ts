import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ listeners: new Map<string, (...args: any[]) => void>(), emit: vi.fn(), disconnect: vi.fn() }));
vi.mock("socket.io-client", () => ({
  io: () => ({
    connected: true,
    on: (event: string, listener: (...args: any[]) => void) => transport.listeners.set(event, listener),
    io: { on: vi.fn() },
    connect: () => queueMicrotask(() => transport.listeners.get("connect")!()),
    disconnect: transport.disconnect,
    emit: transport.emit,
  }),
}));
import { MultiplayerClient } from "../src/client/MultiplayerClient";

describe("shared multiplayer client match identity", () => {
  let client: MultiplayerClient;
  beforeEach(async () => {
    vi.clearAllMocks();
    transport.listeners.clear();
    transport.emit.mockImplementation((_event, _payload, ack) => ack({ ok: true, data: { ok: true } }));
    client = new MultiplayerClient({ serverUrl: "http://test.invalid", authToken: "test-only" });
    await client.connect();
  });
  afterEach(() => client.disconnect());

  it("refuses actions before receiving authoritative match identity", async () => {
    await expect(client.sendAction("room", { type: "move" })).rejects.toThrow("No active match state");
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it("sends the new match identity after a rematch", async () => {
    transport.listeners.get("room:update")!({ id: "room", matchId: "old-match" });
    transport.listeners.get("game:state")!({ roomId: "room", matchId: "new-match", state: {}, events: [] });
    const action = { type: "move", from: "e2", to: "e4" };
    await client.sendAction("room", action);
    expect(transport.emit).toHaveBeenCalledWith("game:action", { roomId: "room", matchId: "new-match", action }, expect.any(Function));
  });

  it.each(["leave", "closed", "waiting", "disconnect"])("clears cached match identity on %s", async event => {
    transport.listeners.get("room:update")!({ id: "room", matchId: "old-match" });
    if (event === "leave") await client.leaveRoom("room");
    if (event === "closed") transport.listeners.get("room:closed")!({ roomId: "room" });
    if (event === "waiting") transport.listeners.get("room:update")!({ id: "room", matchId: null });
    if (event === "disconnect") { client.disconnect(); await client.connect(); }
    transport.emit.mockClear();
    await expect(client.sendAction("room", { type: "move" })).rejects.toThrow("No active match state");
    expect(transport.emit).not.toHaveBeenCalled();
  });
});
