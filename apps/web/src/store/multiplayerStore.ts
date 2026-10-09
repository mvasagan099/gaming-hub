import { recoverSocketSession } from '../services/socket/sessionRecovery';
import { create } from "zustand";
import toast from "react-hot-toast";
import type {
  ChatEmoji,
  ChatMessage,
  ErrorCode,
  GameId,
  JsonObject,
  MatchSettings,
  RoomFull,
  GameEventEnvelope,
  InGameNotification,
  AuthoritativeMatchState,
} from "@gaming-hub/shared";
import {
  unpackCarromState,
  isStaleStateVersion,
  isSequentialStateVersion,
  isStateVersionGap,
  safeRandomUUID,
} from "@gaming-hub/shared";
import { createTypedSocket, type RematchUpdate, type TypedSocket } from "@gaming-hub/socket";
import { useAuthStore } from "./authStore";
import { useWalletStore } from "./walletStore";
import { notifyWalletChanged } from "../services/api/practiceReward";
import { getSocketUrl } from "../services/socket/socketUrl";

const actionSequences = new Map<string, number>();

export type MultiplayerStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

type AckResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export interface WinnerInfo {
  winnerSeats: number[];
  winnerIds: string[];
}

interface MatchmakingInfo {
  queued: boolean;
  position: number;
  gameId: GameId | null;
  stake: number | null;
  settings: MatchSettings;
}

const IDLE_MATCHMAKING: MatchmakingInfo = {
  queued: false,
  position: 0,
  gameId: null,
  stake: null,
  settings: {},
};

const MATCHMAKING_ERROR_CODES = new Set([
  "ALREADY_QUEUED",
  "NOT_IN_QUEUE",
  "MATCHMAKING_OFFLINE",
  "MATCHMAKING_TIMEOUT",
  "FEATURE_DISABLED",
] as ErrorCode[]);

type GameAction = { type: string } & JsonObject;

interface MultiplayerState {
  socket: TypedSocket | null;
  status: MultiplayerStatus;
  error: string | null;
  room: RoomFull | null;
  mySeat: number | null;
  isSpectator: boolean;
  messages: ChatMessage[];
  emojis: ChatEmoji[];
  /** Users currently typing in the room (auto-cleared a couple of seconds after the event). */
  typing: { userId: string; senderName: string }[];
  /** Rematch consent ledger for the current ended room. */
  rematchState: { requestedBy: string[]; active: boolean } | null;
  matchmaking: MatchmakingInfo;
  matchFound: import("@gaming-hub/shared").MatchFoundNotificationPayload | null;
  /** Queue intent preserved across transient reconnects so it can be re-joined. */
  pendingRequeue: { gameId: GameId; stake: number; settings: MatchSettings } | null;
  gameState: JsonObject | null;
  authoritativeState: AuthoritativeMatchState | null;
  lastEvents: { type: string }[];
  matchId: string | null;
  winner: WinnerInfo | null;
  countdown: number | null;
  disconnectGrace: { playerId: string; reconnectExpiresAt: number } | null;
  lastStateVersion: number;
  actionSequence: number;
  lastActionId: string | null;
  stateHash: string | null;
  notifications: InGameNotification[];
  activeNotification: InGameNotification | null;
  matchDeadline: number | null;
  matchTimerWarning: { remainingSeconds: number; remainingMs: number } | null;
  matchTimeExpired: boolean;
  // Force re-render counter for deep state changes
  renderKey: number;

  connect: () => void;
  disconnect: () => void;
  createRoom: (gameId: GameId, isPrivate: boolean, stake: number, maxPlayers?: number, settings?: MatchSettings) => Promise<RoomFull>;
  joinRoom: (input: { roomId?: string; code?: string; asSpectator?: boolean }) => Promise<RoomFull>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<RoomFull | null>;
  startGame: () => Promise<RoomFull | null>;
  kickPlayer: (targetUserId: string) => Promise<void>;
  requestRematch: () => Promise<void>;
  acceptRematch: () => Promise<void>;
  declineRematch: () => Promise<void>;
  /** @deprecated use requestRematch */
  rematch: () => Promise<void>;
  clearError: () => void;
  dismissMatchFound: () => void;
  dismissNotification: (id: string) => void;
  syncGameState: () => Promise<void>;
  requestFullStateSync: (matchId?: string) => Promise<void>;
  joinMatchmaking: (gameId: GameId, stake: number, settings?: MatchSettings) => Promise<void>;
  leaveMatchmaking: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  sendEmoji: (emoji: string) => Promise<void>;
  sendTyping: () => Promise<void>;
  sendGameAction: (action: GameAction) => Promise<{ ok: boolean; error?: string }>;
}

function sessionToken(): string | null {
  return useAuthStore.getState().session?.access_token ?? null;
}

function unwrapAck<T>(res: AckResult<T>): T {
  if (!res.ok) throw new Error((res as { error: { message: string } }).error.message);
  return res.data;
}

let wired = false;
let pendingLeaveRoom: RoomFull | null = null;
let roomLeaveOperation: Promise<void> | null = null;
const departedRooms = new Set<string>();
const departedMatches = new Set<string>();
function rememberDeparture(ids: Set<string>, id: string | null | undefined) {
  if (!id) return;
  ids.add(id);
  if (ids.size > 32) ids.delete(ids.values().next().value!);
}
function finishRoomCleanup(get: () => MultiplayerState): Promise<void> | undefined {
  if (pendingLeaveRoom || roomLeaveOperation || get().room?.status === "ended") {
    return (async () => {
      await get().leaveRoom();
      if (pendingLeaveRoom) throw new Error(get().error || "Room cleanup is still pending. Please try again.");
    })();
  }
}

function applyRoom(set: (partial: Partial<MultiplayerState>) => void, room: RoomFull) {
  const me = useAuthStore.getState().user?.id;
  const player = room.players.find((p) => p.id === me);
  const spectator = room.spectators.find((p) => p.id === me);
  set({
    room,
    mySeat: player?.seat ?? null,
    isSpectator: Boolean(spectator && !player),
    matchmaking: { ...IDLE_MATCHMAKING },
    pendingRequeue: null,
  });
}

function clearRoom(set: (partial: Partial<MultiplayerState>) => void) {
  set({
    matchFound: null,
    matchmaking: { ...IDLE_MATCHMAKING },
    pendingRequeue: null,
    room: null,
    mySeat: null,
    isSpectator: false,
    messages: [],
    gameState: null,
    authoritativeState: null,
    lastEvents: [],
    matchId: null,
    winner: null,
    countdown: null,
    disconnectGrace: null,
    lastStateVersion: 0,
    actionSequence: 0,
    lastActionId: null,
    stateHash: null,
    rematchState: null,
    typing: [],
    matchDeadline: null,
    matchTimerWarning: null,
    matchTimeExpired: false,
  });
}

async function sendRematchConsent(
  event: "game:rematch-request" | "game:rematch-accept" | "game:rematch-decline",
  get: () => MultiplayerState,
  set: (partial: Partial<MultiplayerState>) => void,
) {
  const { socket, room, matchId } = get();
  if (!socket || !room) return;
  set({ error: null });
  try {
    const update = unwrapAck<RematchUpdate>(await socket.emitWithAck(event, { roomId: room.id }));
    // A start broadcast can beat its ACK. Never restore the old vote ledger.
    if (get().room?.id !== room.id || get().matchId !== matchId) return;
    set({ rematchState: update.active ? { requestedBy: update.requestedBy, active: true } : null });
    if (update.active && event !== "game:rematch-decline") toast.success("Rematch requested. Waiting for the other players.");
  } catch (error) {
    if (get().room?.id !== room.id || get().matchId !== matchId) return;
    const message = error instanceof Error ? error.message : "Could not start the rematch. Please try again.";
    set({ error: message });
    toast.error(message);
  }
}

export const useMultiplayerStore = create<MultiplayerState>((set, get) => ({
  socket: null,
  status: "idle",
  error: null,
  room: null,
  mySeat: null,
  isSpectator: false,
  messages: [],
  emojis: [],
  typing: [],
  rematchState: null,
  matchmaking: { ...IDLE_MATCHMAKING },
  matchFound: null,
  pendingRequeue: null,
  gameState: null,
  authoritativeState: null,
  lastEvents: [],
  matchId: null,
  winner: null,
  countdown: null,
  disconnectGrace: null,
  lastStateVersion: 0,
  actionSequence: 0,
  lastActionId: null,
  stateHash: null,
  notifications: [],
  activeNotification: null,
  matchDeadline: null,
  matchTimerWarning: null,
  matchTimeExpired: false,
  renderKey: 0,

  connect: () => {
    if (get().socket) return;
    const token = sessionToken();
    if (!token) {
      set({ status: "idle", error: "Sign in is required to play online" });
      return;
    }

    const socket = createTypedSocket({
      url: getSocketUrl(),
      token: sessionToken,
    });

    const wire = () => {
      if (wired) return;
      wired = true;

      socket.on("connect", () => {
        set({ status: "connected", error: null, matchmaking: { ...IDLE_MATCHMAKING } });
        // Refresh authoritative wallet balance upon connect / reconnect to catch any settlements during outage
        void useWalletStore.getState().fetchWallet();
        // A transient disconnect while queued should resume the queue.
        const requeue = get().pendingRequeue;
        if (requeue) {
          set({ pendingRequeue: null });
          void get().joinMatchmaking(requeue.gameId, requeue.stake, requeue.settings).catch(() => undefined);
        }
      });

      socket.on("disconnect", (reason) => {
        const intentional = reason === "io client disconnect";
        const queued = get().matchmaking.queued;
        const gameId = get().matchmaking.gameId;
        const stake = get().matchmaking.stake;
        const settings = get().matchmaking.settings;
        set({
          status: intentional ? "idle" : "reconnecting",
          matchmaking: { ...IDLE_MATCHMAKING },
          pendingRequeue:
            !intentional && queued && gameId && stake != null
              ? { gameId, stake, settings: settings ?? {} }
              : null,
        });
      });

      socket.on("connect_error", (err: any) => {
        if (['TOKEN_EXPIRED', 'TOKEN_REFRESH', 'MFA_PENDING'].includes(err?.message)) {
          void recoverSocketSession(err.message).then((status) => {
            if (get().socket !== socket) return;
            if (status === 'reconnect') socket.connect();
            else if (status === 'mfa_pending' && typeof window !== 'undefined') window.location.href = '/2fa';
            else useAuthStore.getState().signOut().catch(() => {});
          });
          return;
        }
        if (err?.message === "SESSION_REVOKED") {
          socket.disconnect();
          useAuthStore.getState().signOut().catch(() => {});
          if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
            window.location.href = "/login?reason=session_revoked";
          }
          return;
        }
        set({ status: "error", error: "Could not reach the game server" });
      });

      socket.on('auth:session-revoked', ({ reason }) => {
        if (get().socket !== socket) return;
        const queued = get().matchmaking;
        const requeue = ['TOKEN_REFRESH', 'TOKEN_EXPIRED'].includes(reason)
          && queued.queued && queued.gameId && queued.stake != null
          ? { gameId: queued.gameId, stake: queued.stake, settings: queued.settings ?? {} }
          : null;
        socket.disconnect();
        void recoverSocketSession(reason).then((status) => {
          if (get().socket !== socket) return;
          if (status === 'reconnect') {
            set({ pendingRequeue: requeue });
            socket.connect();
            return;
          }
          if (status === 'mfa_pending') {
            if (typeof window !== 'undefined') window.location.href = '/2fa';
            return;
          }
          useAuthStore.getState().signOut().catch(() => {});
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            window.location.href = '/login?reason=session_revoked';
          }
        });
      });


      socket.on("room:update", (room) => {
        console.log("[MultiplayerStore] room:update received", room.id, "gameId:", room.gameId, "status:", room.status);
        if (departedRooms.has(room.id)) return;
        applyRoom(set, room);
      });

      socket.on("room:closed", (payload) => {
        rememberDeparture(departedRooms, payload.roomId);
        if (get().room?.id === payload.roomId) {
          rememberDeparture(departedMatches, get().room?.matchId ?? get().matchId);
          clearRoom(set);
        }
        if (pendingLeaveRoom?.id === payload.roomId) pendingLeaveRoom = null;
      });

      socket.on("game:state", (payload) => {
        const current = get();
        if (current.room?.id !== payload.roomId || (current.room.matchId && current.room.matchId !== payload.matchId)) return;
        const newMatch = current.matchId !== payload.matchId;
        const logUpdate = import.meta.env.DEV && payload.events.length > 0;
        if (logUpdate) console.log("[MultiplayerStore] game:state received", payload.matchId, "with", payload.events.length, "events");
        const gameState = payload.state as any;
        if (logUpdate && gameState?.fen) {
          console.log("[MultiplayerStore] Chess FEN:", gameState.fen.substring(0, 20) + "...", "turn:", gameState.turn);
        }
        if (logUpdate && gameState?.history) {
          console.log("[MultiplayerStore] Chess move count:", gameState.history.length, "last move:", gameState.lastMove);
        }
        if (logUpdate && gameState?.coins) {
          console.log("[MultiplayerStore] Carrom state:", {
            coins: gameState.coins.length,
            activeCoins: gameState.coins.filter((c: any) => !c.pocketed).length,
            currentSeat: gameState.currentSeat,
            strikerPlacementPhase: gameState.strikerPlacementPhase,
            strikerX: gameState.striker?.x,
            strikerY: gameState.striker?.y,
            events: payload.events.map((e: any) => e.type)
          });
        }
        
        const incomingVersion = (payload as any).sequenceNumber ?? (gameState as any)?.turnNumber ?? 0;
        if (!newMatch && incomingVersion > 0 && incomingVersion <= get().lastStateVersion) {
          if (logUpdate) console.debug("[MultiplayerStore] Discarding duplicate/stale game:state packet:", incomingVersion);
          return;
        }

        // Always increment renderKey and ensure proper state update
        set({
          gameState: unpackCarromState(payload.state),
          lastEvents: payload.events,
          matchId: payload.matchId,
          winner: null,
          matchmaking: { ...IDLE_MATCHMAKING },
          pendingRequeue: null,
          lastStateVersion: newMatch ? incomingVersion : Math.max(get().lastStateVersion, incomingVersion),
          ...(newMatch ? {
            rematchState: null, authoritativeState: null, actionSequence: 0,
            lastActionId: null, stateHash: null, disconnectGrace: null,
            matchDeadline: null, matchTimeExpired: false, matchTimerWarning: null, countdown: null,
          } : {}),
          renderKey: (get().renderKey || 0) + 1, // Always force re-render
        });

        // Acknowledgment to server
        socket.emit("game:state:ack", {
          roomId: payload.roomId,
          matchId: payload.matchId,
          timestamp: Date.now(),
        });
        if (logUpdate) console.log("[MultiplayerStore] Sent game:state:ack for match", payload.matchId);
      });

      // ── Centralized Authoritative State Sync Listener ──
      socket.on("game:state:authoritative", (authoritativeState: AuthoritativeMatchState) => {
        if (departedMatches.has(authoritativeState.matchId)) return;
        if (get().matchId && get().matchId !== authoritativeState.matchId) return;
        const currentVersion = get().lastStateVersion;
        const incomingVersion = authoritativeState.stateVersion;

        // 1. If incomingStateVersion <= currentStateVersion -> IGNORE
        if (isStaleStateVersion(incomingVersion, currentVersion)) {
          if (import.meta.env.DEV) console.log("[STATE] IGNORED_STALE", {
            incomingVersion,
            currentVersion,
            matchId: authoritativeState.matchId,
          });
          return;
        }

        // 2. If incomingStateVersion === currentStateVersion + 1 -> APPLY
        if (isSequentialStateVersion(incomingVersion, currentVersion) || currentVersion === 0) {
          if (import.meta.env.DEV) console.log("[STATE] APPLIED", {
            stateVersion: incomingVersion,
            actionSequence: authoritativeState.actionSequence,
            matchId: authoritativeState.matchId,
          });
          set({
            gameState: authoritativeState.gameState,
            authoritativeState,
            lastStateVersion: incomingVersion,
            actionSequence: authoritativeState.actionSequence,
            lastActionId: authoritativeState.lastActionId,
            stateHash: authoritativeState.stateHash ?? null,
            matchId: authoritativeState.matchId,
            matchmaking: { ...IDLE_MATCHMAKING },
            pendingRequeue: null,
            renderKey: (get().renderKey || 0) + 1,
          });
          return;
        }

        // 3. If incomingStateVersion > currentStateVersion + 1 -> REQUEST FULL SYNC
        if (isStateVersionGap(incomingVersion, currentVersion)) {
          console.warn("[STATE] DESYNC_DETECTED", {
            incomingVersion,
            currentVersion,
            gap: incomingVersion - currentVersion,
            matchId: authoritativeState.matchId,
          });
          void get().requestFullStateSync(authoritativeState.matchId);
        }
      });

      socket.on("match:aborted", (payload) => {
        if (get().room?.id !== payload.roomId || get().matchId !== payload.matchId) return;
        const message = "Match cancelled. Reserved entry fees are being refunded; no player wins.";
        set({ error: message, countdown: null, winner: null });
        toast.error(message);
        void useWalletStore.getState().fetchWallet();
      });

      socket.on("game:over", (payload) => {
        if (departedMatches.has(payload.matchId)) return;
        if (get().matchId && get().matchId !== payload.matchId) return;
        set({
          winner: { winnerSeats: payload.winnerSeats, winnerIds: payload.winnerIds },
          gameState: unpackCarromState(payload.state),
          lastEvents: [],
          matchId: payload.matchId,
          disconnectGrace: null,
          rematchState: null,
          matchmaking: { ...IDLE_MATCHMAKING },
          pendingRequeue: null,
          renderKey: get().renderKey + 1, // Force re-render
        });
      });

      socket.on("game:finished", (payload) => {
        if (departedMatches.has(payload.matchId)) return;
        if (get().matchId && get().matchId !== payload.matchId) return;
        console.log("[MultiplayerStore] game:finished received", payload);
        set({
          winner: {
            winnerSeats: payload.winnerSeats || [],
            winnerIds: payload.winner ? [payload.winner] : [],
          },
          gameState: (payload.finalState as any) ?? get().gameState,
          matchId: payload.matchId,
          disconnectGrace: null,
          matchTimerWarning: null,
          matchmaking: { ...IDLE_MATCHMAKING },
          pendingRequeue: null,
          renderKey: get().renderKey + 1,
        });
      });

      socket.on("game:player-disconnected" as any, (payload: { matchId: string; playerId: string; reconnectExpiresAt: number }) => {
        if (get().matchId && get().matchId !== payload.matchId) return;
        console.log("[MultiplayerStore] game:player-disconnected received", payload);
        set({
          disconnectGrace: {
            playerId: payload.playerId,
            reconnectExpiresAt: payload.reconnectExpiresAt,
          },
        });
      });

      socket.on("game:player-reconnected" as any, (payload: { matchId: string; playerId: string }) => {
        if (get().matchId && get().matchId !== payload.matchId) return;
        console.log("[MultiplayerStore] game:player-reconnected received", payload);
        const current = get().disconnectGrace;
        if (current && current.playerId === payload.playerId) {
          set({ disconnectGrace: null });
        }
      });

      socket.on("game:forfeit" as any, (payload: { matchId: string; forfeitedPlayerId: string; winnerId: string }) => {
        console.log("[MultiplayerStore] game:forfeit received", payload);
        set({ disconnectGrace: null });
      });

      socket.on("game:match-started" as any, (payload: { matchId: string; startedAt: number; matchDeadline?: number; matchDurationSeconds?: number }) => {
        const room = get().room;
        if (!room || room.status !== "playing" || departedRooms.has(room.id) || departedMatches.has(payload.matchId)) return;
        // room:update is the authoritative identity for first starts/rematches.
        // Never let a delayed start notification replace a different match.
        if ((room.matchId ?? get().matchId) !== payload.matchId) return;
        console.log("[MultiplayerStore] game:match-started received", payload);
        set({
          matchId: payload.matchId,
          matchDeadline: payload.matchDeadline ?? null,
          matchTimeExpired: false,
          matchTimerWarning: null,
          winner: null,
          countdown: null,
          matchmaking: { ...IDLE_MATCHMAKING },
          pendingRequeue: null,
        });
      });

      socket.on("match:timer-warning" as any, (payload: { matchId: string; remainingSeconds: number; remainingMs: number }) => {
        if (get().matchId && get().matchId !== payload.matchId) return;
        console.log("[MultiplayerStore] match:timer-warning received", payload);
        set({
          matchTimerWarning: {
            remainingSeconds: payload.remainingSeconds,
            remainingMs: payload.remainingMs,
          },
        });
      });

      socket.on("match:time-expired" as any, (payload: { matchId: string; expiredAt: number }) => {
        if (get().matchId && get().matchId !== payload.matchId) return;
        console.log("[MultiplayerStore] match:time-expired received", payload);
        set({
          matchTimeExpired: true,
          matchTimerWarning: null,
        });
      });

      // ── Live Authoritative Wallet & Settlement Sync ──
      socket.on("wallet:updated" as any, (payload: any) => {
        console.log("[MultiplayerStore] wallet:updated received:", payload);
        if (payload && typeof payload.balance === "number") {
          useWalletStore.getState().setAuthoritativeBalance(payload);
          notifyWalletChanged();
        }
      });

      socket.on("game:settlement-completed" as any, (payload: any) => {
        console.log("[MultiplayerStore] game:settlement-completed received:", payload);
        void useWalletStore.getState().fetchWallet();
        notifyWalletChanged();
      });

      // ── Centralized Real-Time Event System ──
      const seenEventIds = new Set<string>();

      socket.on("game:event", (envelope: GameEventEnvelope<any>) => {
        if (get().matchId && get().matchId !== envelope.matchId) return;
        if (import.meta.env.DEV) console.log("[MultiplayerStore] game:event received:", envelope.eventType, "stateVersion:", envelope.stateVersion, "id:", envelope.eventId);

        // Deduplication
        if (seenEventIds.has(envelope.eventId)) {
          console.log("[MultiplayerStore] Ignoring duplicate eventId:", envelope.eventId);
          return;
        }
        seenEventIds.add(envelope.eventId);
        if (seenEventIds.size > 1000) {
          const first = seenEventIds.values().next().value;
          if (first) seenEventIds.delete(first);
        }

        // Check for stale packets
        const currentVersion = get().lastStateVersion;
        if (envelope.stateVersion > 0 && envelope.stateVersion < currentVersion) {
          console.warn("[MultiplayerStore] Ignoring stale event:", envelope.stateVersion, "<", currentVersion);
          return;
        }

        // Detect version gaps (packet loss / reconnect) and trigger full state sync
        if (currentVersion > 0 && envelope.stateVersion > currentVersion + 1) {
          console.warn("[MultiplayerStore] State version gap detected:", currentVersion, "->", envelope.stateVersion, "- triggering sync");
          void get().syncGameState();
        }

        // Publish physics state and its render marker together so drivers never
        // render the previous snapshot before receiving the new one.
        if (envelope.eventType === "GAME_STATE_UPDATED" && envelope.payload?.state) {
          set({ lastStateVersion: Math.max(currentVersion, envelope.stateVersion),
            renderKey: (get().renderKey || 0) + 1, gameState: envelope.payload.state,
            lastEvents: envelope.payload.events || [], matchId: envelope.matchId });
          return;
        }

        // Apply state version
        set({
          lastStateVersion: Math.max(currentVersion, envelope.stateVersion),
          renderKey: (get().renderKey || 0) + 1,
        });

        // Event-specific handling
        if (envelope.eventType === "COUNTDOWN_UPDATED" && envelope.payload?.countdown !== undefined) {
          set({ countdown: envelope.payload.countdown });
        } else if (envelope.eventType === "PLAYER_DISCONNECTED" && envelope.payload) {
          set({
            disconnectGrace: {
              playerId: envelope.payload.playerId,
              reconnectExpiresAt: envelope.payload.reconnectExpiresAt,
            },
          });
        } else if (envelope.eventType === "PLAYER_RECONNECTED" && envelope.payload) {
          const current = get().disconnectGrace;
          if (current && current.playerId === envelope.payload.playerId) {
            set({ disconnectGrace: null });
          }
        } else if (envelope.eventType === "MATCH_STARTED" && envelope.payload) {
          set({
            matchId: envelope.matchId,
            matchDeadline: envelope.payload.matchDeadline ?? null,
            matchTimeExpired: false,
            matchTimerWarning: null,
            winner: null,
          });
        } else if (envelope.eventType === "MATCH_TIMER_WARNING" && envelope.payload) {
          set({
            matchTimerWarning: {
              remainingSeconds: envelope.payload.remainingSeconds,
              remainingMs: envelope.payload.remainingMs,
            },
          });
        } else if (envelope.eventType === "MATCH_TIME_EXPIRED") {
          set({
            matchTimeExpired: true,
            matchTimerWarning: null,
          });
        } else if ((envelope.eventType === "GAME_FINISHED" || envelope.eventType === "MATCH_COMPLETED") && envelope.payload) {
          set({
            winner: {
              winnerSeats: envelope.payload.winnerSeats || [],
              winnerIds: envelope.payload.winner
                ? [envelope.payload.winner]
                : envelope.payload.winnerId
                  ? [envelope.payload.winnerId]
                  : [],
            },
            gameState: (envelope.payload.finalState as any) ?? get().gameState,
            matchId: envelope.matchId,
            disconnectGrace: null,
            matchTimerWarning: null,
            renderKey: (get().renderKey || 0) + 1,
          });
        }

        // Acknowledge receipt to server
        socket.emit("game:event:ack", {
          matchId: envelope.matchId,
          eventId: envelope.eventId,
          stateVersion: envelope.stateVersion,
        });
      });

      socket.on("game:notification", (notification: InGameNotification) => {
        console.log("[MultiplayerStore] game:notification received:", notification.title, "-", notification.message, `[${notification.priority}]`);

        // Check if targeted to specific user
        const currentUserId = useAuthStore.getState().user?.id;
        if (notification.targetUserId && notification.targetUserId !== currentUserId) {
          return;
        }

        set({
          notifications: [...get().notifications.slice(-49), notification],
          activeNotification: notification,
        });

        if (notification.ephemeralMs) {
          setTimeout(() => {
            if (get().activeNotification?.id === notification.id) {
              set({ activeNotification: null });
            }
          }, notification.ephemeralMs);
        }
      });

      socket.on("chat:message", (message) => {
        set({ messages: [...get().messages.slice(-199), message] });
      });

      socket.on("chat:emoji", (emoji) => {
        set({ emojis: [...get().emojis.slice(-9), emoji] });
      });

      socket.on("chat:typing", (payload) => {
        if (payload.userId === useAuthStore.getState().user?.id) return;
        const exists = get().typing.some((t) => t.userId === payload.userId);
        if (!exists) {
          set({ typing: [...get().typing, { userId: payload.userId, senderName: payload.senderName }] });
        }
        // The server is fire-and-forget; fade the indicator out ourselves.
        setTimeout(() => {
          set({ typing: get().typing.filter((t) => t.userId !== payload.userId) });
        }, 2600);
      });

      socket.on("rematch:update", (update: RematchUpdate) => {
        if (get().room?.id !== update.roomId) return;
        set({ rematchState: update.active ? { requestedBy: update.requestedBy, active: true } : null });
      });

      socket.on("player:kicked", (payload) => {
        if (payload.playerId === useAuthStore.getState().user?.id) {
          set({ error: "You were removed from the room" });
          clearRoom(set);
        }
      });

      socket.on("matchmaking:queued", (payload) => {
        set((s) => ({
          matchmaking: {
            queued: true,
            position: payload.position,
            gameId: s.matchmaking.gameId,
            stake: s.matchmaking.stake,
            settings: s.matchmaking.settings,
          },
        }));
      });

      socket.on("game:queue-joined" as any, (payload: { position: number; gameId: GameId; entryFee: number }) => {
        set((s) => ({
          matchmaking: {
            queued: true,
            position: payload.position,
            gameId: payload.gameId ?? s.matchmaking.gameId,
            stake: payload.entryFee ?? s.matchmaking.stake,
            settings: s.matchmaking.settings,
          },
        }));
      });

      socket.on("matchmaking:found", () => {
        set({ matchmaking: { ...IDLE_MATCHMAKING }, pendingRequeue: null });
      });

      socket.on("game:match-found" as any, (payload: import("@gaming-hub/shared").MatchFoundNotificationPayload) => {
        set({
          matchmaking: { ...IDLE_MATCHMAKING },
          pendingRequeue: null,
          matchFound: payload,
        });
      });

      socket.on("game:queue-cancelled" as any, () => {
        set({ matchmaking: { ...IDLE_MATCHMAKING }, pendingRequeue: null });
      });

      socket.on("game:queue-expired" as any, (payload: { message?: string }) => {
        set({
          matchmaking: { ...IDLE_MATCHMAKING },
          pendingRequeue: null,
          error: payload?.message || "No opponent found — please try searching again.",
        });
      });

      socket.on("matchmaking:timeout" as any, (payload: { message?: string }) => {
        set({
          matchmaking: { ...IDLE_MATCHMAKING },
          pendingRequeue: null,
          error: payload?.message || "No opponent found — please try searching again.",
        });
      });

      socket.on("game:countdown" as any, (payload: { countdown: number }) => {
        set({
          countdown: payload.countdown,
          matchmaking: { ...IDLE_MATCHMAKING },
          pendingRequeue: null,
        });
      });


      socket.on("game:match-cancelled" as any, (payload: { reason?: string }) => {
        set({ countdown: null, error: payload?.reason ? `Match cancelled: ${payload.reason}` : "Match was cancelled" });
      });

      socket.on("error", (payload) => {
        const isMatchmakingError = MATCHMAKING_ERROR_CODES.has(payload.code);
        set({
          error: payload.message,
          ...(isMatchmakingError
            ? { matchmaking: { ...IDLE_MATCHMAKING }, pendingRequeue: null }
            : {}),
        });
      });
    };

    wire();
    set({ socket, status: "connecting" });
    socket.connect();
  },

  disconnect: () => {
    const socket = get().socket;
    if (socket) socket.disconnect();
    wired = false;
    pendingLeaveRoom = null;
    roomLeaveOperation = null;
    departedRooms.clear();
    departedMatches.clear();
    set({
      socket: null,
      status: "idle",
      error: null,
      matchmaking: { ...IDLE_MATCHMAKING },
      pendingRequeue: null,
    });
    clearRoom(set);
  },

  createRoom: async (gameId, isPrivate, stake, maxPlayers, settings) => {
    const cleanup = finishRoomCleanup(get);
    if (cleanup) await cleanup;
    const socket = get().socket;
    if (!socket) throw new Error("Not connected to the game server");
    set({ error: null });
    const res = await socket.emitWithAck("room:create", { gameId, isPrivate, stake, maxPlayers, settings });
    const room = unwrapAck<RoomFull>(res);
    departedRooms.delete(room.id);
    if (room.matchId) departedMatches.delete(room.matchId);
    applyRoom(set, room);
    set({ winner: null, matchmaking: { ...IDLE_MATCHMAKING }, pendingRequeue: null, error: null });
    return room;
  },

  joinRoom: async (input) => {
    const currentRoom = get().room;
    if (!currentRoom || (input.roomId !== currentRoom.id && input.code?.toUpperCase() !== currentRoom.code)) {
      const cleanup = finishRoomCleanup(get);
      if (cleanup) await cleanup;
    }
    const socket = get().socket;
    if (!socket) throw new Error("Not connected to the game server");
    set({ error: null });
    const res = await socket.emitWithAck("room:join", {
      roomId: input.roomId,
      code: input.code,
      asSpectator: input.asSpectator ?? false,
    });
    const room = unwrapAck<RoomFull>(res);
    departedRooms.delete(room.id);
    if (room.matchId) departedMatches.delete(room.matchId);
    applyRoom(set, room);
    set({ winner: null, matchmaking: { ...IDLE_MATCHMAKING }, pendingRequeue: null, error: null });
    return room;
  },

  leaveRoom: async () => {
    if (roomLeaveOperation) return roomLeaveOperation;
    const socket = get().socket;
    const room = get().room ?? pendingLeaveRoom;
    if (!room) return;
    pendingLeaveRoom = room;
    rememberDeparture(departedRooms, room.id);
    rememberDeparture(departedMatches, room.matchId ?? get().matchId);
    if (get().room?.id === room.id) clearRoom(set);
    if (!socket) return;
    const operation = (async () => {
      try {
        const res = await socket.timeout(8_000).emitWithAck("room:leave", { roomId: room.id });
        unwrapAck(res);
        if (pendingLeaveRoom?.id === room.id) pendingLeaveRoom = null;
      } catch (error) {
        // Keep this identity for retry; a new search must not overtake cleanup.
        if (get().socket === socket) set({ error: error instanceof Error ? error.message : "Room cleanup failed. Please try again." });
      }
    })();
    roomLeaveOperation = operation;
    try { await operation; }
    finally { if (roomLeaveOperation === operation) roomLeaveOperation = null; }
  },

  setReady: async (ready) => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || !room) return null;
    const res = await socket.emitWithAck("room:ready", { roomId: room.id, ready });
    const updated = unwrapAck<RoomFull>(res);
    applyRoom(set, updated);
    return updated;
  },

  startGame: async () => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || !room) return null;
    const res = await socket.emitWithAck("room:start", { roomId: room.id });
    const updated = unwrapAck<RoomFull>(res);
    applyRoom(set, updated);
    return updated;
  },

  kickPlayer: async (targetUserId) => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || !room) return;
    const res = await socket.emitWithAck("room:kick", { roomId: room.id, targetUserId });
    unwrapAck(res);
  },

  requestRematch: async () => {
    await sendRematchConsent("game:rematch-request", get, set);
  },

  acceptRematch: async () => {
    await sendRematchConsent("game:rematch-accept", get, set);
  },

  declineRematch: async () => {
    await sendRematchConsent("game:rematch-decline", get, set);
  },

  rematch: async () => {
    await get().requestRematch();
  },

  joinMatchmaking: async (gameId, stake, settings) => {
    const cleanup = finishRoomCleanup(get);
    if (cleanup) await cleanup;
    const socket = get().socket;
    if (!socket) throw new Error("Not connected to the game server");
    set({ error: null });
    const res = await socket.emitWithAck("matchmaking:join", { gameId, stake, settings });
    const data = unwrapAck<{ position: number }>(res);
    // A match broadcast can arrive before the join ACK. Preserve that result.
    if (get().socket !== socket || data.position <= 0 || get().room || get().matchFound || get().matchId) return;
    set({
      matchmaking: { queued: true, position: data.position, gameId, stake, settings: settings ?? {} },
      pendingRequeue: null,
      error: null,
    });
  },

  leaveMatchmaking: async () => {
    const socket = get().socket;
    if (!socket) return;
    try {
      const res = await socket.emitWithAck("matchmaking:leave", {});
      unwrapAck(res);
    } finally {
      set({ matchmaking: { ...IDLE_MATCHMAKING }, pendingRequeue: null });
    }
  },

  sendMessage: async (text) => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || !room) throw new Error("You are not in a room");
    const res = await socket.emitWithAck("chat:message", { roomId: room.id, text });
    unwrapAck<ChatMessage>(res);
  },

  sendEmoji: async (emoji) => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || !room) return;
    const res = await socket.emitWithAck("chat:emoji", { roomId: room.id, emoji });
    unwrapAck(res);
  },

  sendTyping: async () => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || !room) return;
    const res = await socket.emitWithAck("chat:typing", { roomId: room.id });
    unwrapAck(res);
  },

  sendGameAction: async (action) => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || !room) return { ok: false, error: "You are not in a room" };
    if (room.awaitingGameLoad) return { ok: false, error: "Waiting for both game boards to load" };
    const matchId = get().matchId;
    if (!matchId || (room.matchId && room.matchId !== matchId)) return { ok: false, error: "Waiting for the current match state" };
    
    const logAction = !["table-tennis", "fruit-ninja", "snake-vs-worms"].includes(room.gameId);
    if (logAction) console.log("[MultiplayerStore] Client sending game:action to room", room.id, "with action:", action);
    const actionSocket = ["snooker", "snake-vs-worms", "table-tennis"].includes(room.gameId) ? socket.timeout(8000) : socket;
    const userId = useAuthStore.getState().user?.id ?? "";
    const scope = `${matchId}:${userId}`;
    const accepted = room.players.find(p => p.id === userId)?.lastAcceptedActionSequence ?? 0;
    const sequence = Math.max(actionSequences.get(scope) ?? 0, accepted) + 1;
    actionSequences.set(scope, sequence);
    const orderedAction = { ...action, actionId: action.actionId ?? safeRandomUUID(), clientSequence: sequence };
    const res = await actionSocket.emitWithAck("game:action", { roomId: room.id, matchId, action: orderedAction });
    
    if (!res.ok) {
      const errMsg = (res as { error?: { message: string } }).error?.message ?? "Action failed";
      console.log("[MultiplayerStore] Game action failed:", errMsg);
      return { ok: false, error: errMsg };
    }
    if (!res.data.ok) {
      console.log("[MultiplayerStore] Game action rejected by server:", res.data.error);
      return { ok: false, error: res.data.error ?? "Action rejected" };
    }
    
    if (logAction) console.log("[MultiplayerStore] Game action accepted by server, awaiting game:state broadcast");
    // State arrives via the `game:state` broadcast; applying it here too would
    // double-render the same event set on the acting client.
    return { ok: true };
  },

  dismissNotification: (id: string) => {
    set({
      notifications: get().notifications.filter((n) => n.id !== id),
      activeNotification: get().activeNotification?.id === id ? null : get().activeNotification,
    });
  },

  requestFullStateSync: async (matchIdParam?: string) => {
    const socket = get().socket;
    const room = get().room;
    const matchId = matchIdParam ?? get().matchId;
    if (!socket || !matchId) return;

    console.log("[STATE] SYNC_REQUESTED", { matchId, lastStateVersion: get().lastStateVersion });

    try {
      const res = await socket.emitWithAck("game:state-sync", {
        matchId,
        lastStateVersion: get().lastStateVersion,
        roomId: room?.id,
      });

      if (res.ok && res.data) {
        if (get().matchId !== matchId || get().room?.id !== room?.id) return;
        if (res.data.stateVersion < get().lastStateVersion) return;
        const full = res.data.fullState;
        console.log("[STATE] SYNC_COMPLETED", {
          matchId,
          stateVersion: res.data.stateVersion,
          actionSequence: res.data.actionSequence,
        });
        set({
          gameState: full.gameState,
          authoritativeState: full,
          lastStateVersion: res.data.stateVersion,
          actionSequence: res.data.actionSequence,
          stateHash: res.data.stateHash ?? null,
          renderKey: (get().renderKey || 0) + 1,
        });
      }
    } catch (err) {
      console.error("[MultiplayerStore] game:state-sync error", err);
    }
  },

  syncGameState: async () => {
    return get().requestFullStateSync();
  },

  dismissMatchFound: () => set({ matchFound: null }),
  clearError: () => set({ error: null }),
}));
