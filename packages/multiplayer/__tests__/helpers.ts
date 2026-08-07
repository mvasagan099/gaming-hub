import type { Server } from "socket.io";
import { MultiplayerFramework } from "../src/framework";
import { createEngine } from "@gaming-hub/game-engine";
import type { GameId } from "@gaming-hub/shared";
import type {
  PlayerRuntime,
  RoomRuntime,
  RoomConfig,
} from "../src/types";

/** A minimal socket.io server stub sufficient for framework unit tests. */
export function createIoStub(): Server {
  return {
    to: () => ({ emit: () => undefined }),
    in: () => ({ socketsLeave: () => undefined }),
    sockets: { sockets: new Map() },
  } as unknown as Server;
}

/** A minimal client socket stub used to join queues and rooms. */
export function makeSocket(id: string): Socket {
  return {
    id,
    connected: true,
    data: { user: { username: `user-${id}`, displayName: `User ${id}`, avatarUrl: null } },
    join: () => undefined,
    leave: () => undefined,
    emit: () => undefined,
  } as unknown as Socket;
}

/** Build a framework instance (singleton is reset by the caller). */
export function createTestFramework(
  opts: { enableAntiCheat?: boolean; enableReplay?: boolean } = {},
): MultiplayerFramework {
  return MultiplayerFramework.getInstance({
    io: createIoStub(),
    enableAntiCheat: opts.enableAntiCheat ?? true,
    enableReplay: opts.enableReplay ?? true,
  });
}

/** Build a fully-populated player runtime. */
export function makePlayer(
  id: string,
  seat: number,
  opts: Partial<PlayerRuntime> = {},
): PlayerRuntime {
  const now = Date.now();
  return {
    id,
    userId: id,
    username: `user-${id}`,
    displayName: `User ${id}`,
    avatarUrl: null,
    seat,
    isReady: true,
    isHost: seat === 0,
    isSpectator: false,
    connectionStatus: "connected",
    socketIds: new Set([`socket-${id}`]),
    joinedAt: now,
    lastActivityAt: now,
    afkWarnings: 0,
    pendingActions: [],
    reconnectionAttempts: 0,
    lastPingMs: null,
    packetSequenceNumber: 0,
    statistics: { movesMade: 0, timeSpentMs: 0, afkTimeMs: 0, disconnections: 0, reconnections: 0 },
    ...opts,
  };
}

/** Build an empty room holding the given players. */
export function makeRoom(
  gameId: GameId,
  players: PlayerRuntime[],
  opts: Partial<RoomRuntime> = {},
): RoomRuntime {
  const playersMap = new Map(players.map((p) => [p.id, p]));
  const config: RoomConfig = {
    gameId,
    isPrivate: false,
    stake: 0,
    maxPlayers: 4,
    minPlayers: 2,
    password: null,
    allowSpectators: true,
    maxSpectators: 4,
    settings: {},
  };
  return {
    id: "room-1",
    code: "ABC123",
    ioName: "room-1",
    config,
    hostId: players[0].id,
    status: "playing",
    players: playersMap,
    spectators: new Map(),
    createdAt: Date.now(),
    expiresAt: null,
    locked: false,
    match: null,
    rematch: null,
    chatHistory: [],
    eventLog: [],
    ...opts,
  };
}

/** Build a room with an active authoritative engine attached. */
export function createMatchRoom(gameId: GameId, players: PlayerRuntime[]): RoomRuntime {
  const room = makeRoom(gameId, players);
  const engine = createEngine(
    gameId,
    players.map((p) => ({ userId: p.id, seat: p.seat as number })),
    () => 0.5,
  );
  room.match = {
    matchId: "match-1",
    engine,
    turnNumber: 0,
    startedAt: Date.now(),
    pausedAt: null,
    pausedBy: null,
    finishedAt: null,
    winnerIds: [],
    winnerSeats: [],
    stateSnapshots: [{ turnNumber: 0, timestamp: Date.now(), state: engine.serialize() }],
    actionHistory: [],
  };
  return room;
}
