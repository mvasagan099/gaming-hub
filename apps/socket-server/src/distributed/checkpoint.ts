import { serializeEngineState, restoreEngineState, type EngineCheckpoint, type EngineInstance } from '@gaming-hub/game-engine';
import type { RoomRuntime, PlayerRuntime, MatchRuntime } from '@gaming-hub/multiplayer';
import type { MultiplayerFramework } from '@gaming-hub/multiplayer';

type StoredPlayer = Pick<PlayerRuntime, 'id' | 'userId' | 'seat' | 'isReady' | 'isHost' | 'isSpectator' |
  'connectionStatus' | 'joinedAt' | 'lastActivityAt' | 'afkWarnings' | 'packetSequenceNumber'>;
export interface RoomCheckpoint {
  schemaVersion: 1;
  room: Pick<RoomRuntime, 'id' | 'code' | 'ioName' | 'config' | 'hostId' | 'status' | 'createdAt' | 'expiresAt' | 'locked' | 'rematch' | 'lifecyclePhase' | 'countdownEndsAt' | 'pendingMatchId'>;
  players: StoredPlayer[];
  spectators: StoredPlayer[];
  stateVersion: number;
  reconnectTimers?: Array<{ playerId: string; expiresAt: number }>;
  match: (Omit<MatchRuntime, 'engine' | 'stateSnapshots'> & { engine: EngineCheckpoint }) | null;
}
function playerState(player: PlayerRuntime): StoredPlayer {
  return { id: player.id, userId: player.userId, seat: player.seat, isReady: player.isReady,
    isHost: player.isHost, isSpectator: player.isSpectator, connectionStatus: player.connectionStatus,
    joinedAt: player.joinedAt, lastActivityAt: player.lastActivityAt, afkWarnings: player.afkWarnings,
    packetSequenceNumber: player.packetSequenceNumber };
}
export function serializeRoomCheckpoint(framework: MultiplayerFramework, room: RoomRuntime): RoomCheckpoint {
  const { id, code, ioName, config, hostId, status, createdAt, expiresAt, locked, rematch, lifecyclePhase, countdownEndsAt, pendingMatchId } = room;
  let match: RoomCheckpoint['match'] = null;
  if (room.match) {
    const { engine, stateSnapshots: _snapshots, ...canonical } = room.match;
    const participants = room.match.participants ?? [...room.players.values()].filter(p => p.seat != null)
      .map(p => ({ userId: p.userId, seat: p.seat! }));
    match = { ...canonical, participants, engine: serializeEngineState(engine as EngineInstance, participants) };
  }
  return structuredClone({ schemaVersion: 1, room: { id, code, ioName, config, hostId, status, createdAt, expiresAt, locked, rematch, pendingMatchId: pendingMatchId ?? null, ...(lifecyclePhase ? { lifecyclePhase, countdownEndsAt: countdownEndsAt ?? null } : {}) },
    players: [...room.players.values()].map(playerState), spectators: [...room.spectators.values()].map(playerState),
    reconnectTimers: framework.timerManager.checkpointReconnectTimers(room.id),
    stateVersion: framework.syncManager.getStateVersion(room.id), match });
}
function restorePlayer(player: StoredPlayer): PlayerRuntime {
  return { ...player, username: 'Player', displayName: 'Player', avatarUrl: null,
    socketIds: new Set(), pendingActions: [], reconnectionAttempts: 0, lastPingMs: null };
}
export function restoreRoomCheckpoint(framework: MultiplayerFramework, snapshot: RoomCheckpoint): RoomRuntime {
  if (!snapshot || snapshot.schemaVersion !== 1 || !snapshot.room?.id || !Array.isArray(snapshot.players) ||
      !Number.isInteger(snapshot.stateVersion) || snapshot.stateVersion < 0) throw new Error('INCOMPATIBLE_ROOM_CHECKPOINT');
  const participants = snapshot.players.filter(p => !p.isSpectator);
  const identities = participants.map(p => p.id), seats = participants.map(p => p.seat);
  if (new Set(identities).size !== identities.length || new Set(seats).size !== seats.length ||
      participants.some(p => p.id !== p.userId || !Number.isSafeInteger(p.seat) || p.seat! < 0 ||
        !Number.isSafeInteger(p.packetSequenceNumber) || p.packetSequenceNumber < 0) ||
      !identities.includes(snapshot.room.hostId) || snapshot.players.some(p => p.isSpectator) ||
      snapshot.spectators.some(p => !p.isSpectator || identities.includes(p.id))) throw new Error('INVALID_ROOM_PARTICIPANTS');
  if (snapshot.match && (snapshot.match.engine.gameId !== snapshot.room.config.gameId ||
      snapshot.match.engine.participants.some(p => !participants.some(r => r.id === p.userId && r.seat === p.seat)) ||
      snapshot.match.engine.participants.length !== participants.length)) throw new Error('INVALID_MATCH_PARTICIPANTS');
  if (snapshot.match?.startConfirmationRequired && (
      !Array.isArray(snapshot.match.loadedPlayerIds) ||
      new Set(snapshot.match.loadedPlayerIds).size !== snapshot.match.loadedPlayerIds.length ||
      snapshot.match.loadedPlayerIds.some(id => !identities.includes(id)) ||
      (snapshot.room.status === 'playing' && snapshot.match.gameplayStartedAt == null &&
        !Number.isFinite(snapshot.match.loadDeadline)))) throw new Error('INVALID_GAME_LOAD_CHECKPOINT');
  if (snapshot.room.lifecyclePhase === 'COUNTDOWN' && (!snapshot.match || !Number.isFinite(snapshot.room.countdownEndsAt)))
    throw new Error('INVALID_COUNTDOWN_CHECKPOINT');
  // Validate reconnect entries before registering any runtime or scheduling callbacks.
  if ((snapshot.reconnectTimers ?? []).some(t => !identities.includes(t.playerId) || !Number.isFinite(t.expiresAt)))
    throw new Error('INVALID_RECONNECT_CHECKPOINT');
  const match = snapshot.match ? { ...snapshot.match, engine: restoreEngineState(snapshot.match.engine), stateSnapshots: [] } : null;
  const room: RoomRuntime = { ...snapshot.room, players: new Map(snapshot.players.map(p => [p.id, restorePlayer(p)])),
    spectators: new Map(snapshot.spectators.map(p => [p.id, restorePlayer(p)])), match,
    chatHistory: [], eventLog: [] };
  framework.roomManager.registerRoom(room);
  framework.syncManager.restoreStateVersion(room.id, snapshot.stateVersion);
  for (const timer of snapshot.reconnectTimers ?? []) {
    const player = room.players.get(timer.playerId);
    if (!player || !Number.isFinite(timer.expiresAt)) throw new Error("INVALID_RECONNECT_CHECKPOINT");
    framework.timerManager.startTimer(room.id, "reconnect", Math.max(0, timer.expiresAt - Date.now()),
      () => room.status === "starting"
        ? framework.roomManager.closeRoom(room.id, "countdown_disconnect_timeout")
        : framework.matchManager.handlePlayerForfeit(room, player, "disconnect_timeout"), player.id);
  }
  return room;
}
