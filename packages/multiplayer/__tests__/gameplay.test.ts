import { describe, it, expect, beforeEach } from "vitest";
import { MultiplayerFramework } from "../src/framework";
import type { EngineInstance, EngineActionResult } from "@gaming-hub/game-engine";
import type { JsonObject } from "@gaming-hub/shared";
import type { PlayerRuntime, RoomRuntime } from "../src/types";
import { createTestFramework, makePlayer, createMatchRoom } from "./helpers";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("GameStateManager", () => {
  let framework: MultiplayerFramework;

  beforeEach(() => {
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({ enableAntiCheat: false });
  });

  it("exposes the authoritative engine and initial snapshot", () => {
    const room = createMatchRoom("chess", [makePlayer("p1", 0), makePlayer("p2", 1)]);
    expect(framework.gameStateManager.getEngine(room)).not.toBeNull();
    expect(framework.gameStateManager.getTurnNumber(room)).toBe(0);
    expect(framework.gameStateManager.isFinished(room)).toBe(false);
    expect(framework.gameStateManager.getSnapshot(room, 0)).toBeDefined();
    expect(framework.gameStateManager.getLatestSnapshot(room)).toBeDefined();
  });

  it("records an applied action into history and snapshots", () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("chess", [p1, p2]);
    const engine = room.match!.engine as EngineInstance;

    const result = engine.apply({ type: "move", from: "e2", to: "e4" }, 0);
    expect(result.ok).toBe(true);

    const recorded = framework.gameStateManager.recordResult(
      room,
      result as EngineActionResult<JsonObject>,
      "p1",
      0,
      { type: "move", from: "e2", to: "e4" },
      [],
    );

    expect(framework.gameStateManager.getTurnNumber(room)).toBe(1);
    expect(recorded.turnNumber).toBe(1);
    expect(room.match!.actionHistory).toHaveLength(1);
    expect(room.match!.stateSnapshots).toHaveLength(2);
    expect(framework.gameStateManager.verifyReplay(room).valid).toBe(true);
  });

  it("serializes state mutations per room", async () => {
    const room = createMatchRoom("chess", [makePlayer("p1", 0), makePlayer("p2", 1)]);
    const order: number[] = [];

    const first = framework.gameStateManager.enqueue(room.id, async () => {
      await sleep(10);
      order.push(1);
    });
    const second = framework.gameStateManager.enqueue(room.id, async () => {
      await sleep(1);
      order.push(2);
    });

    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
  });

  it("detects snapshot gaps when replay integrity is broken", () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("chess", [p1, p2]);
    room.match!.stateSnapshots.push({
      turnNumber: 7,
      timestamp: Date.now(),
      state: { corrupted: true },
    });
    const check = framework.gameStateManager.verifyReplay(room);
    expect(check.valid).toBe(false);
    expect(check.error).toContain("Snapshot gap");
  });
});

describe("TurnManager", () => {
  let framework: MultiplayerFramework;

  beforeEach(() => {
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({ enableAntiCheat: false });
  });

  it("gates turn-based games by the engine's current seat", () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("chess", [p1, p2]);

    expect(framework.turnManager.isTurnBased(room)).toBe(true);
    expect(framework.turnManager.getCurrentSeat(room)).toBe(0);
    expect(framework.turnManager.getCurrentPlayerId(room)).toBe("p1");
    expect(framework.turnManager.canAct(room, p1, { type: "move" })).toBe(true);
    expect(framework.turnManager.canAct(room, p2, { type: "move" })).toBe(false);
    expect(framework.turnManager.canAct(room, p2, { type: "resign" })).toBe(true);
    expect(framework.turnManager.canAct(room, p2, { type: "pause" })).toBe(true);
  });

  it("never gates realtime games", () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("table-tennis", [p1, p2]);

    expect(framework.turnManager.isTurnBased(room)).toBe(false);
    expect(framework.turnManager.canAct(room, p1, { type: "paddle-move" })).toBe(true);
    expect(framework.turnManager.canAct(room, p2, { type: "paddle-move" })).toBe(true);
  });
});

describe("ActionValidator", () => {
  let framework: MultiplayerFramework;

  beforeEach(() => {
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({ enableAntiCheat: false });
  });

  it("rejects actions when no match is in progress", () => {
    const room = createMatchRoom("chess", [makePlayer("p1", 0), makePlayer("p2", 1)]);
    room.status = "waiting";
    room.match = null;
    const check = framework.actionValidator.validate(room, room.players.get("p1") as PlayerRuntime, { type: "move" });
    expect(check.ok).toBe(false);
    expect(check.error).toContain("not in progress");
  });

  it("rejects spectator actions", () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("chess", [p1, p2]);
    const spectator = makePlayer("spec", -1, { isSpectator: true, seat: null });
    const check = framework.actionValidator.validate(room, spectator, { type: "move" });
    expect(check.ok).toBe(false);
    expect(check.error).toContain("Spectators");
  });

  it("rejects out-of-turn moves in turn-based games", () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("chess", [p1, p2]);
    const check = framework.actionValidator.validate(room, p2, { type: "move" });
    expect(check.ok).toBe(false);
    expect(check.error).toContain("not your turn");
  });

  it("rate-limits repeated realtime actions", () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("table-tennis", [p1, p2]);
    expect(framework.actionValidator.validate(room, p1, { type: "paddle-move" }).ok).toBe(true);
    framework.actionValidator.recordAction(p1.id);
    const second = framework.actionValidator.validate(room, p1, { type: "paddle-move" });
    expect(second.ok).toBe(false);
    expect(second.error).toContain("too frequent");
  });

  it("accepts a legal action", () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("chess", [p1, p2]);
    expect(framework.actionValidator.validate(room, p1, { type: "move" }).ok).toBe(true);
  });
});

describe("WinnerCalculator", () => {
  let framework: MultiplayerFramework;

  beforeEach(() => {
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({ enableAntiCheat: false });
  });

  function result(
    finished: boolean,
    winnerSeats: number[],
    state: JsonObject = {},
  ): EngineActionResult<JsonObject> {
    return { ok: true, state, events: [], finished, winnerSeats };
  }

  it("resolves a decisive win", () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("chess", [p1, p2]);
    const matchResult = framework.winnerCalculator.calculate(
      room,
      result(true, [0], { winnerSeats: [0], endReason: "checkmate" }),
    );

    expect(matchResult.winnerIds).toEqual(["p1"]);
    expect(matchResult.winnerSeats).toEqual([0]);
    expect(matchResult.draw).toBe(false);
    expect(matchResult.endReason).toBe("checkmate");
    expect(matchResult.players.find((p) => p.playerId === "p1")!.outcome).toBe("won");
    expect(matchResult.players.find((p) => p.playerId === "p2")!.outcome).toBe("lost");
  });
  it('preserves Snake vs Worms scores in the final result sent for settlement', () => {
    const room = createMatchRoom('snake-vs-worms', [makePlayer('p1', 0), makePlayer('p2', 1)]);
    const outcome = framework.winnerCalculator.calculate(room, result(true, [1], {
      players: [{ seat: 1, score: 150 }, { seat: 0, score: 50 }],
    }));
    expect(outcome.players.map(p => [p.seat, p.score])).toEqual([[0, 50], [1, 150]]);
  });

  it("resolves a draw", () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("chess", [p1, p2]);
    const matchResult = framework.winnerCalculator.calculate(room, result(true, []));

    expect(matchResult.draw).toBe(true);
    expect(matchResult.winnerIds).toEqual([]);
    for (const playerResult of matchResult.players) {
      expect(playerResult.outcome).toBe("draw");
    }
  });

  it("marks an unfinished match as aborted", () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("chess", [p1, p2]);
    const matchResult = framework.winnerCalculator.calculate(room, result(false, []));

    for (const playerResult of matchResult.players) {
      expect(playerResult.outcome).toBe("aborted");
    }
  });

  it("extracts per-seat scores when the engine exposes them", () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("carrom", [p1, p2]);
    const matchResult = framework.winnerCalculator.calculate(
      room,
      result(true, [0], { scores: { 0: 25, 1: 8 } }),
    );

    expect(matchResult.players.find((p) => p.playerId === "p1")!.score).toBe(25);
    expect(matchResult.players.find((p) => p.playerId === "p2")!.score).toBe(8);
  });
});

describe("StatisticsCollector", () => {
  let framework: MultiplayerFramework;

  beforeEach(() => {
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({ enableAntiCheat: false });
  });

  it("counts moves separately from base actions", () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("chess", [p1, p2]);

    framework.statisticsCollector.recordAction(room, p1, { type: "move", from: "e2", to: "e4" });
    framework.statisticsCollector.recordAction(room, p1, { type: "resign" });

    const stats = framework.statisticsCollector.getMatchStats(room.id, "p1");
    expect(stats).not.toBeNull();
    expect(stats!.movesMade).toBe(1);
    expect(stats!.actionsTaken).toBe(2);
    expect(stats!.actionTypes["move"]).toBe(1);
    expect(stats!.actionTypes["resign"]).toBe(1);
  });

  it("records turn time and disconnect/reconnect counters", () => {
    const p1 = makePlayer("p1", 0);
    const p2 = makePlayer("p2", 1);
    const room = createMatchRoom("chess", [p1, p2]);

    framework.statisticsCollector.recordAction(room, p1, { type: "move" });
    framework.statisticsCollector.recordTurnTime(room.id, "p1", 500);
    framework.statisticsCollector.recordDisconnect(room.id, "p1");
    framework.statisticsCollector.recordReconnect(room.id, "p1");

    const stats = framework.statisticsCollector.getMatchStats(room.id, "p1");
    expect(stats!.timeOnTurnMs).toBe(500);
    expect(stats!.disconnections).toBe(1);
    expect(stats!.reconnections).toBe(1);
  });
});
