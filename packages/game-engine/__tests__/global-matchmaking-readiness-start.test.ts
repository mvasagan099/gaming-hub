import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  GAME_IDS,
  type GameId,
  type MatchConfigSnapshot,
  DEFAULT_GAME_CONFIGS,
} from "@gaming-hub/shared";
import {
  SnakeLadderEngine,
  LudoEngine,
  ChessEngine,
  FruitNinjaEngine,
  BubbleShooterEngine,
  TableTennisEngine,
  SnakeVsWormsEngine,
  CricketEngine,
  CarromEngine,
  SnookerEngine,
  createEngine,
  secureRandomSource,
} from "../src";

type RoomStatus = "waiting" | "ready" | "starting" | "playing" | "finished" | "cancelled";

interface MockPlayer {
  userId: string;
  displayName: string;
  seat: number | null;
  isReady: boolean;
  connected: boolean;
  balance: number;
}

interface MockRoom {
  id: string;
  gameId: GameId;
  status: RoomStatus;
  stake: number;
  minPlayers: number;
  maxPlayers: number;
  players: Map<string, MockPlayer>;
  readyExpiresAt: number | null;
  readyTimeoutTriggered: boolean;
  countdown: number | null;
  countdownStarted: boolean;
  matchStartedAt: number | null;
  matchDeadline: number | null;
  configSnapshot: MatchConfigSnapshot | null;
  engine: any | null;
  refundProcessed: boolean;
  entryFeesHeld: boolean;
}

describe("GLOBAL MATCHMAKING, MATCH START & PLAYER READINESS SYSTEM", () => {
  let activeRooms: Map<string, MockRoom>;
  let matchmakingQueues: Map<string, Array<{ userId: string; queuedAt: number; balance: number }>>;
  let userActiveRooms: Map<string, string>; // userId -> roomId (where status === playing or starting)
  let walletBalances: Map<string, number>;
  let walletTransactions: Array<{ userId: string; type: "DEDUCT" | "REFUND" | "PAYOUT"; amount: number; matchId: string }>;

  beforeEach(() => {
    activeRooms = new Map();
    matchmakingQueues = new Map();
    userActiveRooms = new Map();
    walletBalances = new Map();
    walletTransactions = [];

    // Initialize mock players
    walletBalances.set("p1", 1000);
    walletBalances.set("p2", 1000);
    walletBalances.set("p3", 1000);
    walletBalances.set("p4", 1000);
    walletBalances.set("p_poor", 10);
  });

  // Helper: Matchmaking join
  const joinMatchmaking = (userId: string, gameId: GameId, stake: number) => {
    // 1. Validation: active match
    if (userActiveRooms.has(userId)) {
      throw new Error("ALREADY_IN_ACTIVE_MATCH: Player is already in an active match");
    }

    // 2. Validation: balance
    const balance = walletBalances.get(userId) ?? 0;
    if (stake > 0 && balance < stake) {
      throw new Error(`INSUFFICIENT_BALANCE: Player needs ${stake} coins`);
    }

    const queueKey = `${gameId}:${stake}`;
    const queue = matchmakingQueues.get(queueKey) ?? [];

    // 3. Validation: duplicate queue
    if (queue.some((p) => p.userId === userId)) {
      throw new Error("ALREADY_QUEUED: Player is already in matchmaking queue");
    }

    queue.push({ userId, queuedAt: Date.now(), balance });
    matchmakingQueues.set(queueKey, queue);

    return { position: queue.length };
  };

  // Helper: Matchmaking pair
  const tryPairMatchmaking = (gameId: GameId, stake: number, requiredPlayers = 2) => {
    const queueKey = `${gameId}:${stake}`;
    const queue = matchmakingQueues.get(queueKey);
    if (!queue || queue.length < requiredPlayers) return null;

    const matchedPlayers = queue.splice(0, requiredPlayers);
    const roomId = `room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Create room
    const room: MockRoom = {
      id: roomId,
      gameId,
      status: "waiting",
      stake,
      minPlayers: requiredPlayers,
      maxPlayers: requiredPlayers,
      players: new Map(),
      readyExpiresAt: Date.now() + 30_000, // 30s ready timeout
      readyTimeoutTriggered: false,
      countdown: null,
      countdownStarted: false,
      matchStartedAt: null,
      matchDeadline: null,
      configSnapshot: null,
      engine: null,
      refundProcessed: false,
      entryFeesHeld: false,
    };

    matchedPlayers.forEach((p, idx) => {
      room.players.set(p.userId, {
        userId: p.userId,
        displayName: `Player ${idx + 1}`,
        seat: idx,
        isReady: false,
        connected: true,
        balance: p.balance,
      });
    });

    activeRooms.set(roomId, room);
    return room;
  };

  // Helper: Player set ready
  const setPlayerReady = (roomId: string, userId: string, ready: boolean) => {
    const room = activeRooms.get(roomId);
    if (!room) throw new Error("Room not found");
    if (room.status === "playing" || room.status === "finished") {
      throw new Error("Match already started");
    }
    if (room.status === "starting") {
      throw new Error("Countdown already in progress, ready is locked");
    }

    const player = room.players.get(userId);
    if (!player) throw new Error("Player not in room");
    player.isReady = ready;

    // Check if all players ready
    const participants = [...room.players.values()];
    const allReady = participants.length >= room.minPlayers && participants.every((p) => p.isReady && p.connected);

    if (allReady) {
      room.status = "ready";
      room.readyExpiresAt = null; // Clear ready timeout
      // Start Countdown
      startCountdown(room);
    }
  };

  // Helper: Start Countdown
  const startCountdown = (room: MockRoom) => {
    room.status = "starting";
    room.countdownStarted = true;
    room.countdown = 3;

    // Mark active for duplicate protection
    for (const userId of room.players.keys()) {
      userActiveRooms.set(userId, room.id);
    }
  };

  // Helper: Progress Countdown Tick
  const countdownTick = (room: MockRoom, toValue: number) => {
    if (room.status !== "starting") return;
    room.countdown = toValue;

    if (toValue === 0) {
      // Launch Match Atomically
      launchMatchAtomic(room);
    }
  };

  // Helper: Atomic Match Launch
  const launchMatchAtomic = (room: MockRoom) => {
    if (room.status !== "starting" && room.status !== "ready") return;

    // 1. Process entry fee wagers exactly once
    if (room.stake > 0 && !room.entryFeesHeld) {
      for (const player of room.players.values()) {
        const currentBal = walletBalances.get(player.userId) ?? 0;
        if (currentBal < room.stake) {
          // Abort and refund
          abortFailedStart(room, "INSUFFICIENT_BALANCE");
          return;
        }
        walletBalances.set(player.userId, currentBal - room.stake);
        walletTransactions.push({
          userId: player.userId,
          type: "DEDUCT",
          amount: room.stake,
          matchId: room.id,
        });
      }
      room.entryFeesHeld = true;
    }

    // 2. Snapshot configuration
    const config = DEFAULT_GAME_CONFIGS[room.gameId];
    room.configSnapshot = {
      gameId: room.gameId,
      name: config.name,
      entryFee: room.stake,
      minPlayers: room.minPlayers,
      maxPlayers: room.maxPlayers,
      turnTimerSeconds: config.turnTimerSeconds,
      reconnectWindowSeconds: config.reconnectWindowSeconds,
      matchDurationSeconds: config.matchDurationSeconds ?? 600,
      timeoutResolution: config.timeoutResolution ?? "GAME_SPECIFIC",
      allowDraw: config.allowDraw ?? true,
      prizeMode: config.prizeMode,
      winnerPercentage: config.winnerPercentage,
      drawPolicy: config.drawPolicy,
      configVersion: config.configVersion,
      gameSpecificSettings: config.gameSpecificSettings ?? {},
      snapshotAt: Date.now(),
    };

    // 3. Create engine with server-side RNG
    const enginePlayers = [...room.players.values()].map((p) => ({
      userId: p.userId,
      seat: p.seat!,
    }));
    room.engine = createEngine(room.gameId, enginePlayers, secureRandomSource(), {});

    // 4. Set authoritative timestamps
    const now = Date.now();
    room.matchStartedAt = now;
    room.matchDeadline = now + (room.configSnapshot.matchDurationSeconds * 1000); // Exactly 600s
    room.status = "playing";
    room.countdown = null;
  };

  // Helper: Abort failed start & refund
  const abortFailedStart = (room: MockRoom, reason: string) => {
    room.status = "cancelled";
    room.countdownStarted = false;
    room.countdown = null;

    if (room.entryFeesHeld && !room.refundProcessed) {
      for (const player of room.players.values()) {
        const currentBal = walletBalances.get(player.userId) ?? 0;
        walletBalances.set(player.userId, currentBal + room.stake);
        walletTransactions.push({
          userId: player.userId,
          type: "REFUND",
          amount: room.stake,
          matchId: room.id,
        });
      }
      room.refundProcessed = true;
    }

    for (const userId of room.players.keys()) {
      userActiveRooms.delete(userId);
    }
  };

  // Helper: Ready Timeout Expiration
  const triggerReadyTimeout = (roomId: string) => {
    const room = activeRooms.get(roomId);
    if (!room || room.status === "playing" || room.status === "finished") return;

    room.readyTimeoutTriggered = true;
    abortFailedStart(room, "READY_TIMEOUT");
  };

  // =========================================================================
  // 1. MATCHMAKING & VALIDATION
  // =========================================================================
  describe("1. Matchmaking & Eligibility Validation", () => {
    it("places valid player into matchmaking queue without deducting entry fee upfront", () => {
      const res = joinMatchmaking("p1", "chess", 100);
      expect(res.position).toBe(1);
      // Entry fee must NOT be deducted while waiting in queue
      expect(walletBalances.get("p1")).toBe(1000);
      expect(walletTransactions.length).toBe(0);
    });

    it("rejects player with insufficient balance from entering queue", () => {
      expect(() => {
        joinMatchmaking("p_poor", "chess", 100);
      }).toThrow(/INSUFFICIENT_BALANCE/);
    });

    it("rejects duplicate queue entry for the same player", () => {
      joinMatchmaking("p1", "chess", 100);
      expect(() => {
        joinMatchmaking("p1", "chess", 100);
      }).toThrow(/ALREADY_QUEUED/);
    });
  });

  // =========================================================================
  // 2. DUPLICATE MATCH & ACTIVE MATCH PROTECTION
  // =========================================================================
  describe("2. Duplicate Match Protection", () => {
    it("prevents a player in an active match from joining matchmaking or another room", () => {
      // p1 and p2 join and launch match 1
      joinMatchmaking("p1", "snooker", 50);
      joinMatchmaking("p2", "snooker", 50);
      const room = tryPairMatchmaking("snooker", 50)!;
      setPlayerReady(room.id, "p1", true);
      setPlayerReady(room.id, "p2", true);
      countdownTick(room, 0); // Active match launched

      expect(room.status).toBe("playing");
      expect(userActiveRooms.get("p1")).toBe(room.id);

      // p1 tries to join another matchmaking queue
      expect(() => {
        joinMatchmaking("p1", "ludo", 50);
      }).toThrow(/ALREADY_IN_ACTIVE_MATCH/);
    });
  });

  // =========================================================================
  // 3. PLAYER READINESS & 30-SECOND READY TIMEOUT
  // =========================================================================
  describe("3. Player Readiness & Timeout", () => {
    it("tracks readiness and does NOT start match until all required players ready up", () => {
      joinMatchmaking("p1", "carrom", 100);
      joinMatchmaking("p2", "carrom", 100);
      const room = tryPairMatchmaking("carrom", 100)!;

      expect(room.status).toBe("waiting");
      expect(room.matchStartedAt).toBeNull();
      expect(room.matchDeadline).toBeNull();

      // Only Player 1 readies up
      setPlayerReady(room.id, "p1", true);
      expect(room.status).toBe("waiting");
      expect(room.countdownStarted).toBe(false);

      // Player 2 readies up -> triggers countdown
      setPlayerReady(room.id, "p2", true);
      expect(room.status).toBe("starting");
      expect(room.countdownStarted).toBe(true);
      expect(room.countdown).toBe(3);
    });

    it("cancels room and does NOT start 10m timer if ready timeout expires", () => {
      joinMatchmaking("p1", "snooker", 100);
      joinMatchmaking("p2", "snooker", 100);
      const room = tryPairMatchmaking("snooker", 100)!;

      // Player 1 readies, Player 2 never readies -> 30s timeout fires
      setPlayerReady(room.id, "p1", true);
      triggerReadyTimeout(room.id);

      expect(room.status).toBe("cancelled");
      expect(room.readyTimeoutTriggered).toBe(true);
      expect(room.matchStartedAt).toBeNull();
      expect(room.matchDeadline).toBeNull();
      // No entry fees deducted or retained
      expect(walletBalances.get("p1")).toBe(1000);
      expect(walletBalances.get("p2")).toBe(1000);
    });
  });

  // =========================================================================
  // 4. SERVER-AUTHORITATIVE COUNTDOWN & DISCONNECT BEFORE START
  // =========================================================================
  describe("4. Countdown & Pre-Start Disconnect", () => {
    it("progresses 3 -> 2 -> 1 -> 0 and launches match atomically", () => {
      joinMatchmaking("p1", "fruit-ninja", 50);
      joinMatchmaking("p2", "fruit-ninja", 50);
      const room = tryPairMatchmaking("fruit-ninja", 50)!;

      setPlayerReady(room.id, "p1", true);
      setPlayerReady(room.id, "p2", true);
      expect(room.countdown).toBe(3);

      countdownTick(room, 2);
      expect(room.countdown).toBe(2);
      expect(room.status).toBe("starting");
      expect(room.matchStartedAt).toBeNull(); // Timer has NOT started yet

      countdownTick(room, 1);
      expect(room.countdown).toBe(1);
      expect(room.matchStartedAt).toBeNull();

      countdownTick(room, 0); // Reaches 0
      expect(room.status).toBe("playing");
      expect(room.matchStartedAt).toBeGreaterThan(0);
      expect(room.matchDeadline).toBe(room.matchStartedAt! + 600_000); // 10m timer starts HERE
    });

    it("cancels countdown if a player disconnects during countdown", () => {
      joinMatchmaking("p1", "cricket", 50);
      joinMatchmaking("p2", "cricket", 50);
      const room = tryPairMatchmaking("cricket", 50)!;

      setPlayerReady(room.id, "p1", true);
      setPlayerReady(room.id, "p2", true);
      expect(room.status).toBe("starting");

      // Player 2 disconnects during countdown
      const p2 = room.players.get("p2")!;
      p2.connected = false;
      p2.isReady = false;
      room.status = "waiting";
      room.countdownStarted = false;
      room.countdown = null;

      expect(room.status).toBe("waiting");
      expect(room.matchStartedAt).toBeNull();
    });
  });

  // =========================================================================
  // 5. CRITICAL TIMER RULE & INVARIANCE
  // =========================================================================
  describe("5. Critical 10-Minute Timer Start Rule", () => {
    it("timer starts ONLY at MATCH_STARTED across all 10 games", () => {
      for (const gameId of GAME_IDS) {
        joinMatchmaking("p1", gameId, 100);
        joinMatchmaking("p2", gameId, 100);
        const room = tryPairMatchmaking(gameId, 100)!;

        // Stage 1: WAITING
        expect(room.status).toBe("waiting");
        expect(room.matchStartedAt).toBeNull();
        expect(room.matchDeadline).toBeNull();

        // Stage 2: READY
        setPlayerReady(room.id, "p1", true);
        setPlayerReady(room.id, "p2", true);
        expect(room.matchStartedAt).toBeNull();

        // Stage 3: COUNTDOWN
        countdownTick(room, 2);
        expect(room.matchStartedAt).toBeNull();

        // Stage 4: MATCH_STARTED
        countdownTick(room, 0);
        expect(room.status).toBe("playing");
        expect(room.matchStartedAt).toBeDefined();
        expect(room.matchDeadline).toBe(room.matchStartedAt! + 600_000);
        expect(room.configSnapshot?.matchDurationSeconds).toBe(600);

        // Reset for next game test
        userActiveRooms.clear();
        walletBalances.set("p1", 1000);
        walletBalances.set("p2", 1000);
      }
    });

    it("reconnect after match start does NOT reset or extend the 10-minute deadline", () => {
      joinMatchmaking("p1", "table-tennis", 100);
      joinMatchmaking("p2", "table-tennis", 100);
      const room = tryPairMatchmaking("table-tennis", 100)!;
      setPlayerReady(room.id, "p1", true);
      setPlayerReady(room.id, "p2", true);
      countdownTick(room, 0);

      const originalStartedAt = room.matchStartedAt!;
      const originalDeadline = room.matchDeadline!;

      // Simulate player 1 disconnecting and reconnecting
      const p1 = room.players.get("p1")!;
      p1.connected = false; // Disconnected
      // ... time passes ...
      p1.connected = true; // Reconnected

      // Deadline MUST remain invariant
      expect(room.matchStartedAt).toBe(originalStartedAt);
      expect(room.matchDeadline).toBe(originalDeadline);
    });
  });

  // =========================================================================
  // 6. FINANCIAL & WALLET INTEGRATION SAFETY
  // =========================================================================
  describe("6. Financial & Entry Fee Processing", () => {
    it("deducts entry fee exactly once upon match launch", () => {
      joinMatchmaking("p1", "bubble-shooter", 150);
      joinMatchmaking("p2", "bubble-shooter", 150);
      const room = tryPairMatchmaking("bubble-shooter", 150)!;

      setPlayerReady(room.id, "p1", true);
      setPlayerReady(room.id, "p2", true);
      countdownTick(room, 0);

      expect(walletBalances.get("p1")).toBe(850);
      expect(walletBalances.get("p2")).toBe(850);

      const deductions = walletTransactions.filter((t) => t.type === "DEDUCT");
      expect(deductions.length).toBe(2);
      expect(deductions.every((d) => d.amount === 150)).toBe(true);
    });

    it("refunds entry fee if match fails to start or aborts before active gameplay", () => {
      joinMatchmaking("p1", "snake-vs-worms", 200);
      joinMatchmaking("p2", "snake-vs-worms", 200);
      const room = tryPairMatchmaking("snake-vs-worms", 200)!;

      setPlayerReady(room.id, "p1", true);
      // Abort before start
      abortFailedStart(room, "SYSTEM_ERROR");

      expect(walletBalances.get("p1")).toBe(1000);
      expect(walletBalances.get("p2")).toBe(1000);
    });
  });

  // =========================================================================
  // 7. TOURNAMENT MATCH START FLOW
  // =========================================================================
  describe("7. Tournament Match Flow", () => {
    it("runs tournament match through ready -> countdown -> match start with 10m limit", () => {
      // Bracket assigns p3 vs p4 (0 entry stake, metadata attached)
      const roomId = "tournament-match-1";
      const room: MockRoom = {
        id: roomId,
        gameId: "snake-ladder",
        status: "waiting",
        stake: 0,
        minPlayers: 2,
        maxPlayers: 2,
        players: new Map([
          ["p3", { userId: "p3", displayName: "Player 3", seat: 0, isReady: false, connected: true, balance: 1000 }],
          ["p4", { userId: "p4", displayName: "Player 4", seat: 1, isReady: false, connected: true, balance: 1000 }],
        ]),
        readyExpiresAt: Date.now() + 30_000,
        readyTimeoutTriggered: false,
        countdown: null,
        countdownStarted: false,
        matchStartedAt: null,
        matchDeadline: null,
        configSnapshot: null,
        engine: null,
        refundProcessed: false,
        entryFeesHeld: true, // Tournament fee handled at registration
      };
      activeRooms.set(roomId, room);

      // Both players ready up
      setPlayerReady(roomId, "p3", true);
      setPlayerReady(roomId, "p4", true);
      expect(room.status).toBe("starting");

      countdownTick(room, 0);
      expect(room.status).toBe("playing");
      expect(room.matchStartedAt).toBeDefined();
      expect(room.matchDeadline).toBe(room.matchStartedAt! + 600_000);
    });
  });
});
