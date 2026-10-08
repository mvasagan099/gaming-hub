import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { MultiplayerFramework, RoomRuntime } from '@gaming-hub/multiplayer';
import type { MatchResult } from '@gaming-hub/multiplayer';
import type { Prisma } from '@gaming-hub/db';
import { RedisMatchOwnership } from './ownership';
import { PostgresMatchStore, type DurableResult } from './store';
import { serializeRoomCheckpoint, restoreRoomCheckpoint, type RoomCheckpoint } from './checkpoint';

interface TransactionContext { active: boolean; roomId: string | null; publications: Array<{ destination: string; event: string; payload: unknown }>; result?: DurableResult; closed?: boolean }
interface OwnedRoom { token: string; revision: number }
export interface RoutedCommand { roomId?: string; code?: string; event: string; playerId: string; socketId: string; user: Record<string, unknown>; payload: Record<string, unknown> }
interface RpcMessage { requestId: string; replyChannel: string; command: RoutedCommand }

/** One owner per room, durable commit before every acknowledged/broadcast mutation. */
export class DistributedRoomCoordinator {
  readonly instanceId: string;
  private readonly context = new AsyncLocalStorage<TransactionContext>();
  private readonly owned = new Map<string, OwnedRoom>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly ownership: RedisMatchOwnership;
  private readonly subscriber: Redis;
  private readonly pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
  private storeAvailable = false;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private dispatch!: (command: RoutedCommand) => Promise<unknown>;
  private readonly rpcChannel: string;
  private readonly replyChannel: string;

  constructor(private readonly framework: MultiplayerFramework, private readonly redis: Redis,
    private readonly store = new PostgresMatchStore(), private readonly ttlMs = 10_000,
    private readonly namespace = 'gaming:distributed', instanceId = randomUUID()) {
    this.instanceId = instanceId;
    this.ownership = new RedisMatchOwnership(redis, `${namespace}:lease`);
    this.subscriber = redis.duplicate();
    this.subscriber.on("error", () => this.framework.error("Coordination subscription unavailable", "REDIS_UNAVAILABLE"));
    this.rpcChannel = `${namespace}:rpc:${instanceId}`;
    this.replyChannel = `${namespace}:reply:${instanceId}`;
  }

  async start(dispatch: (command: RoutedCommand) => Promise<unknown>) {
    await this.store.validateSchema();
    this.storeAvailable = true;
    this.dispatch = dispatch;
    this.subscriber.on('message', (channel, data) => {
      try {
      if (data.length > 64 * 1024) return;
      if (channel === this.replyChannel) {
        const reply = JSON.parse(data) as { requestId: string; ok: boolean; value: unknown; error?: string };
        const request = this.pending.get(reply.requestId);
        if (request) reply.ok ? request.resolve(reply.value) : request.reject(new Error(reply.error ?? 'OWNER_COMMAND_FAILED'));
      } else if (channel === this.rpcChannel) {
        const request = JSON.parse(data) as RpcMessage;
        // Only this exact reply namespace is accepted. Redis must be private/ACL protected.
        if (!request.command?.roomId || !request.requestId || !request.replyChannel.startsWith(`${this.namespace}:reply:`)) return;
        void this.local(request.command.roomId!, () => this.dispatch(request.command)).then(
          value => this.redis.publish(request.replyChannel, JSON.stringify({ requestId: request.requestId, ok: true, value })),
          error => this.redis.publish(request.replyChannel, JSON.stringify({ requestId: request.requestId, ok: false, error: (error as Error).message })),
        ).catch(() => this.framework.error("Owner reply transport unavailable", "RPC_REPLY_FAILED"));
      }
      } catch { this.framework.error('Invalid coordination message', 'RPC_INVALID'); }
    });
    if (this.subscriber.status === 'wait') await this.subscriber.connect();
    await this.subscriber.subscribe(this.rpcChannel, this.replyChannel);
    this.heartbeat = setInterval(() => {
      for (const [roomId, owner] of this.owned) {
        void this.renew(roomId, owner).catch(() => { this.storeAvailable = false; this.fenceOff(roomId); });
      }
      void this.recoverExpired().then(() => { this.storeAvailable = true; }, () => { this.storeAvailable = false; this.framework.error('Ownership recovery store unavailable', 'RECOVERY_UNAVAILABLE'); });
    }, Math.max(100, Math.floor(this.ttlMs / 3)));
    this.heartbeat.unref();
  }

  isReady() { return this.storeAvailable && this.redis.status === "ready" && this.subscriber.status === "ready"; }

  async stop() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const [roomId, owner] of this.owned) await this.ownership.release(roomId, this.instanceId, owner.token).catch(() => undefined);
    await this.subscriber.quit();
  }

  publish(room: RoomRuntime, event: string, payload: unknown, destination: string) {
    const transaction = this.context.getStore();
    if (!transaction?.active || (transaction.roomId && transaction.roomId !== room.id)) throw new Error('UNFENCED_ROOM_PUBLICATION');
    transaction.publications.push({ destination, event, payload: structuredClone(payload) });
  }

  async prepareFunding(room: RoomRuntime, matchId: string): Promise<void> {
    const transaction = this.context.getStore();
    const owner = this.owned.get(room.id);
    if (!transaction?.active || transaction.roomId !== room.id || !owner) throw new Error('UNFENCED_FUNDING_INTENT');
    room.pendingMatchId = matchId;
    // A recoverable pre-funding room remains ready to retry this exact identity.
    const snapshot = serializeRoomCheckpoint(this.framework, room);
    snapshot.room.status = 'waiting'; snapshot.room.lifecyclePhase = 'READY_CHECK';
    await this.ownership.assert(room.id, this.instanceId, owner.token);
    owner.revision = await this.store.commit(room.id, this.instanceId, owner.token, owner.revision,
      room.match?.matchId ?? null, snapshot as unknown as Prisma.InputJsonValue);
  }

  async finalResult(room: RoomRuntime, result: MatchResult) {
    const transaction = this.context.getStore();
    if (!transaction?.active || transaction.roomId !== room.id) throw new Error('UNFENCED_MATCH_RESULT');
    room.match!.pendingResult = structuredClone(result);
    transaction.result = { id: `${result.matchId}:result:v1`, matchId: result.matchId, roomId: room.id,
      result: { matchResult: result as unknown as Prisma.InputJsonValue, stake: room.config.stake,
        rated: room.config.settings.rated !== false, tournamentId: room.config.settings.tournamentId ?? null, tournamentRoundId: room.config.settings.tournamentRoundId ?? null } as Prisma.InputJsonValue };
  }


  async close(room: RoomRuntime, reason: string): Promise<void> {
    if (reason === 'server_shutdown') { this.fenceOff(room.id); return; }
    await this.local(room.id, async () => {
      const current = this.framework.roomManager.getRoom(room.id)!;
      if (current.pendingMatchId) {
        this.context.getStore()!.result = { id: `${current.pendingMatchId}:result:v1`, matchId: current.pendingMatchId, roomId: current.id,
          result: { kind: 'CANCEL', reason, matchId: current.pendingMatchId } };
      } else if (current.match && !current.match.finishedAt) await this.framework.matchManager.abortMatch(current, reason);
      current.status = 'ended';
      this.context.getStore()!.closed = true;
      this.publish(current, 'room:closed', { roomId: current.id, reason }, current.ioName);
    });
  }

  async abortedResult(room: RoomRuntime, reason: string): Promise<void> {
    const transaction = this.context.getStore();
    if (!transaction?.active || transaction.roomId !== room.id || !room.match) throw new Error('UNFENCED_MATCH_RESULT');
    transaction.result = { id: `${room.match.matchId}:result:v1`, matchId: room.match.matchId, roomId: room.id,
      result: { kind: 'CANCEL', reason, matchId: room.match.matchId } };
  }

  findPlayer(playerId: string) { return this.store.findPlayer(playerId); }

  /** Searching again may release a completed room, never forfeit an active match. */
  async leaveEndedRoom(command: RoutedCommand): Promise<boolean> {
    const previous = await this.store.findPlayer(command.playerId);
    if (!previous) return true;
    const checkpoint = await this.store.load(previous.id);
    if (!checkpoint || checkpoint.closed) return true;
    if ((checkpoint.snapshot as unknown as RoomCheckpoint).room?.status !== 'ended') return false;
    // Recheck under the authoritative owner's lock in case a rematch starts meanwhile.
    await this.route({ ...command, event: 'room:leave', roomId: previous.id,
      payload: { onlyIfEnded: true } });
    return !await this.store.findPlayer(command.playerId);
  }

  async assertRematchSettled(room: RoomRuntime): Promise<void> {
    if (room.config.stake > 0 && room.match && !await this.store.isResultDelivered(room.match.matchId)) {
      throw new Error('Previous match settlement is still processing. Try rematch after your wallet is updated.');
    }
  }

  /** The origin has already authenticated playerId; clients never supply this envelope. */
  async route(command: RoutedCommand): Promise<unknown> {
    if (command.event === 'room:create') return this.dispatch(command);
    // Routing needs identity only. Do not transfer an ever-growing match history
    // from PostgreSQL on every paddle input; takeover loads the full checkpoint.
    const stored = await this.store.resolveRoom({ roomId: command.roomId, code: command.code,
      matchId: command.payload.matchId ? String(command.payload.matchId) : undefined });
    if (!stored || stored.closed) throw new Error('Room not found');
    command = { ...command, roomId: stored.id };
    const lease = await this.ownership.inspect(stored.id);
    if (!lease || lease.ownerId === this.instanceId) return this.local(stored.id, () => this.dispatch(command));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('MATCH_OWNER_TEMPORARILY_UNAVAILABLE')); }, 5000);
      this.pending.set(requestId, { resolve: value => { clearTimeout(timer); this.pending.delete(requestId); resolve(value); },
        reject: error => { clearTimeout(timer); this.pending.delete(requestId); reject(error); } });
      void this.redis.publish(`${this.namespace}:rpc:${lease.ownerId}`, JSON.stringify({ requestId,
        replyChannel: this.replyChannel, command })).catch(() => {
          clearTimeout(timer); this.pending.delete(requestId); reject(new Error('MATCH_COORDINATION_UNAVAILABLE'));
        });
    });
  }

  /** Admit the creator before making the room visible to replica recovery. */
  async create(task: () => Promise<RoomRuntime>): Promise<RoomRuntime> {
    return this.context.run({ active: true, roomId: null, publications: [] }, async () => {
      try {
      const room = await task();
      room.lifecyclePhase ??= 'WAITING';
      room.config.settings.requiresGameStartValidation = true;
      const snapshot = serializeRoomCheckpoint(this.framework, room);
      let token: string | undefined;
      try {
        token = await this.store.nextFencingToken();
        if (!await this.ownership.acquire(room.id, this.instanceId, token, this.ttlMs)) throw new Error('MATCH_HAS_ANOTHER_OWNER');
        await this.store.create(room.id, room.code, snapshot as unknown as Prisma.InputJsonValue,
          { ownerId: this.instanceId, token, ttlMs: this.ttlMs });
        await this.ownership.assert(room.id, this.instanceId, token);
        this.owned.set(room.id, { token, revision: 0 });
      } catch (error) {
        this.fenceOff(room.id);
        if (token) await this.ownership.release(room.id, this.instanceId, token).catch(() => undefined);
        throw error;
      }
      return await this.local(room.id, async () => {
        const transaction = this.context.getStore()!;
        transaction.publications.push({ destination: room.ioName, event: 'room:update', payload: this.framework.syncManager.serializeRoom(room) });
        return room;
      });
      } finally { this.context.getStore()!.active = false; }
    });
  }

  async local<T>(roomId: string, task: () => Promise<T>): Promise<T> {
    const transaction = this.context.getStore();
    if (transaction?.active && transaction.roomId === roomId) return task();
    const previous = this.queues.get(roomId) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(async () => {
      if (!this.owned.has(roomId)) await this.acquire(roomId, true);
      const owner = this.owned.get(roomId)!;
      await this.ownership.assert(roomId, this.instanceId, owner.token);
      const originalRoom = this.framework.roomManager.getRoom(roomId)!;
      const connections = new Map([...originalRoom.players.values(), ...originalRoom.spectators.values()]
        .map(player => [player.id, new Set(player.socketIds)]));
      return this.context.run({ active: true, roomId, publications: [] }, async () => {
        try {
          const value = await task();
          const room = this.framework.roomManager.getRoom(roomId);
          if (!room) throw new Error('Room closed without a durable transition');
          const context = this.context.getStore()!;
          await this.ownership.assert(roomId, this.instanceId, owner.token);
          const snapshot = serializeRoomCheckpoint(this.framework, room);
          owner.revision = await this.store.commit(roomId, this.instanceId, owner.token, owner.revision,
            room.match?.matchId ?? null, snapshot as unknown as Prisma.InputJsonValue, context.result, context.closed ?? false);
          await this.ownership.assert(roomId, this.instanceId, owner.token);
          for (const event of context.publications) this.framework.io.to(event.destination).emit(event.event, event.payload);
          if (context.closed) { this.framework.io.in(room.ioName).socketsLeave(room.ioName); this.fenceOff(roomId); }
          return value;
        } catch (error) {
          // Invalid commands cannot discard the good owner or retain partial
          // in-memory mutations. Restore only under the same valid fence.
          const failedRoom = this.framework.roomManager.getRoom(roomId);
          for (const player of [...(failedRoom?.players.values() ?? []), ...(failedRoom?.spectators.values() ?? [])]) {
            for (const socketId of player.socketIds) if (!connections.get(player.id)?.has(socketId))
              this.framework.io.in(socketId).socketsLeave(originalRoom.ioName);
          }
          this.fenceOff(roomId);
          try {
            await this.ownership.assert(roomId, this.instanceId, owner.token);
            const committed = await this.store.load(roomId);
            if (!committed || committed.closed || committed.fencingToken.toString() !== owner.token) throw new Error('STALE_MATCH_OWNER');
            const restored = restoreRoomCheckpoint(this.framework, committed.snapshot as unknown as RoomCheckpoint);
            // Connections are process-local presentation/transport facts. Keep
            // them on same-owner rollback; never persist old socket IDs.
            for (const player of [...restored.players.values(), ...restored.spectators.values()]) {
              player.socketIds = new Set(connections.get(player.id) ?? []);
              for (const socketId of player.socketIds) this.framework.io.in(socketId).socketsJoin(restored.ioName);
            }
            this.owned.set(roomId, { token: owner.token, revision: committed.revision });
            this.framework.matchManager.restoreRuntime(this.framework.roomManager.getRoom(roomId)!);
          } catch { this.fenceOff(roomId); }
          throw error;
        }
        finally { this.context.getStore()!.active = false; }
      });
    });
    this.queues.set(roomId, operation);
    const releaseQueue = () => { if (this.queues.get(roomId) === operation) this.queues.delete(roomId); };
    void operation.then(releaseQueue, releaseQueue);
    return operation;
  }

  private async acquire(roomId: string, restore: boolean) {
    const token = await this.store.nextFencingToken();
    if (!await this.ownership.acquire(roomId, this.instanceId, token, this.ttlMs)) throw new Error('MATCH_HAS_ANOTHER_OWNER');
    try {
      await this.store.adopt(roomId, this.instanceId, token, this.ttlMs);
      const stored = await this.store.load(roomId);
      if (!stored) throw new Error('Missing durable room');
      this.owned.set(roomId, { token, revision: stored.revision });
      if (restore) restoreRoomCheckpoint(this.framework, stored.snapshot as unknown as RoomCheckpoint);
      const room = this.framework.roomManager.getRoom(roomId)!;
      this.framework.matchManager.restoreRuntime(room);
    } catch (error) { this.fenceOff(roomId); await this.ownership.release(roomId, this.instanceId, token); throw error; }
  }

  private async renew(roomId: string, owner: OwnedRoom) {
    if (!await this.ownership.renew(roomId, this.instanceId, owner.token, this.ttlMs)) throw new Error('STALE_MATCH_OWNER');
    await this.store.renew(roomId, this.instanceId, owner.token, this.ttlMs);
  }
  async recoverExpired(): Promise<void> {
    for (const room of await this.store.expiredRooms()) {
      if (this.owned.has(room.id)) continue;
      try { await this.acquire(room.id, true); }
      catch (error) {
        if ((error as Error).message !== 'MATCH_HAS_ANOTHER_OWNER') this.framework.error('Room recovery requires retry or compatibility review', { roomId: room.id, code: 'RECOVERY_FAILED' });
      }
    }
  }
  private fenceOff(roomId: string) {
    const room = this.framework.roomManager.getRoom(roomId);
    if (room) this.framework.matchManager.detachRoom(room);
    this.framework.antiCheatManager.clearRoomActionCache(roomId);
    this.framework.timerManager.clearRoomTimers(roomId);
    this.framework.roomManager.unregisterRoom(roomId);
    this.owned.delete(roomId);
  }
}
