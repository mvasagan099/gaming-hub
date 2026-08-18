import { create } from "zustand";
import type {
  ChatEmoji,
  ChatMessage,
  ErrorCode,
  GameId,
  JsonObject,
  MatchSettings,
  RoomFull,
} from "@gaming-hub/shared";
import { createTypedSocket, type RematchUpdate, type TypedSocket } from "@gaming-hub/socket";
import { useAuthStore } from "./authStore";

function getSocketUrl(): string {
  const envUrl = (import.meta.env.VITE_SOCKET_URL as string | undefined) || "http://localhost:4001";
  if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return envUrl.replace("localhost", window.location.hostname).replace("127.0.0.1", window.location.hostname);
  }
  return envUrl;
}

const SOCKET_URL = getSocketUrl();

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
  /** Queue intent preserved across transient reconnects so it can be re-joined. */
  pendingRequeue: { gameId: GameId; stake: number; settings: MatchSettings } | null;
  gameState: JsonObject | null;
  lastEvents: { type: string }[];
  matchId: string | null;
  winner: WinnerInfo | null;
  countdown: number | null;
  disconnectGrace: { playerId: string; reconnectExpiresAt: number } | null;
  lastStateVersion: number;
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
  joinMatchmaking: (gameId: GameId, stake: number, settings?: MatchSettings) => Promise<void>;
  leaveMatchmaking: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  sendEmoji: (emoji: string) => Promise<void>;
  sendTyping: () => Promise<void>;
  sendGameAction: (action: GameAction) => Promise<{ ok: boolean; error?: string }>;}

function sessionToken(): string | null {
  return useAuthStore.getState().session?.access_token ?? null;
}

function unwrapAck<T>(res: AckResult<T>): T {
  if (!res.ok) throw new Error((res as { error: { message: string } }).error.message);
  return res.data;
}

let wired = false;

function applyRoom(set: (partial: Partial<MultiplayerState>) => void, room: RoomFull) {
  const me = useAuthStore.getState().user?.id;
  const player = room.players.find((p) => p.id === me);
  const spectator = room.spectators.find((p) => p.id === me);
  set({
    room,
    mySeat: player?.seat ?? null,
    isSpectator: Boolean(spectator && !player),
  });
}

function clearRoom(set: (partial: Partial<MultiplayerState>) => void) {
  set({
    room: null,
    mySeat: null,
    isSpectator: false,
    messages: [],
    gameState: null,
    lastEvents: [],
    matchId: null,
    winner: null,
    countdown: null,
    disconnectGrace: null,
    lastStateVersion: 0,
    rematchState: null,
    typing: [],
  });
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
  pendingRequeue: null,
  gameState: null,
  lastEvents: [],
  matchId: null,
  winner: null,
  countdown: null,
  disconnectGrace: null,
  lastStateVersion: 0,
  renderKey: 0,

  connect: () => {
    if (get().socket) return;
    const token = sessionToken();
    if (!token) {
      set({ status: "idle", error: "Sign in is required to play online" });
      return;
    }

    const socket = createTypedSocket({
      url: SOCKET_URL,
      token: sessionToken,
    });

    const wire = () => {
      if (wired) return;
      wired = true;

      socket.on("connect", () => {
        set({ status: "connected", error: null, matchmaking: { ...IDLE_MATCHMAKING } });
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

      socket.on("connect_error", () => {
        set({ status: "error", error: "Could not reach the game server" });
      });

      socket.on("room:update", (room) => {
        console.log("[MultiplayerStore] room:update received", room.id, "gameId:", room.gameId, "status:", room.status);
        applyRoom(set, room);
      });

      socket.on("room:closed", () => clearRoom(set));

      socket.on("game:state", (payload) => {
        console.log("[MultiplayerStore] game:state received", payload.matchId, "with", payload.events.length, "events");
        const gameState = payload.state as any;
        if (gameState?.fen) {
          console.log("[MultiplayerStore] Chess FEN:", gameState.fen.substring(0, 20) + "...", "turn:", gameState.turn);
        }
        if (gameState?.history) {
          console.log("[MultiplayerStore] Chess move count:", gameState.history.length, "last move:", gameState.lastMove);
        }
        if (gameState?.coins) {
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
        if (incomingVersion > 0 && incomingVersion < get().lastStateVersion) {
          console.warn("[MultiplayerStore] Discarding stale game:state packet:", incomingVersion, "<", get().lastStateVersion);
          return;
        }

        // Always increment renderKey and ensure proper state update
        set({
          gameState: payload.state,
          lastEvents: payload.events,
          matchId: payload.matchId,
          winner: null,
          lastStateVersion: Math.max(get().lastStateVersion, incomingVersion),
          renderKey: (get().renderKey || 0) + 1, // Always force re-render
        });

        // Acknowledgment to server
        socket.emit("game:state:ack", {
          roomId: payload.roomId,
          matchId: payload.matchId,
          timestamp: Date.now(),
        });
        console.log("[MultiplayerStore] Sent game:state:ack for match", payload.matchId);
      });

      socket.on("game:over", (payload) => {
        set({
          winner: { winnerSeats: payload.winnerSeats, winnerIds: payload.winnerIds },
          gameState: payload.state,
          lastEvents: [],
          matchId: payload.matchId,
          disconnectGrace: null,
          rematchState: null,
          renderKey: get().renderKey + 1, // Force re-render
        });
      });

      socket.on("game:player-disconnected" as any, (payload: { matchId: string; playerId: string; reconnectExpiresAt: number }) => {
        console.log("[MultiplayerStore] game:player-disconnected received", payload);
        set({
          disconnectGrace: {
            playerId: payload.playerId,
            reconnectExpiresAt: payload.reconnectExpiresAt,
          },
        });
      });

      socket.on("game:player-reconnected" as any, (payload: { matchId: string; playerId: string }) => {
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
        set({ rematchState: { requestedBy: update.requestedBy, active: update.active } });
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

      socket.on("matchmaking:found", () => {
        set({ matchmaking: { ...IDLE_MATCHMAKING }, pendingRequeue: null });
      });

      socket.on("game:countdown" as any, (payload: { countdown: number }) => {
        set({ countdown: payload.countdown });
      });

      socket.on("game:match-started" as any, () => {
        set({ countdown: null });
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
    const socket = get().socket;
    if (!socket) throw new Error("Not connected to the game server");
    set({ error: null });
    const res = await socket.emitWithAck("room:create", { gameId, isPrivate, stake, maxPlayers, settings });
    const room = unwrapAck<RoomFull>(res);
    applyRoom(set, room);
    set({ winner: null, matchmaking: { ...IDLE_MATCHMAKING }, pendingRequeue: null, error: null });
    return room;
  },

  joinRoom: async (input) => {
    const socket = get().socket;
    if (!socket) throw new Error("Not connected to the game server");
    set({ error: null });
    const res = await socket.emitWithAck("room:join", {
      roomId: input.roomId,
      code: input.code,
      asSpectator: input.asSpectator ?? false,
    });
    const room = unwrapAck<RoomFull>(res);
    applyRoom(set, room);
    set({ winner: null, matchmaking: { ...IDLE_MATCHMAKING }, pendingRequeue: null, error: null });
    return room;
  },

  leaveRoom: async () => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || !room) {
      clearRoom(set);
      return;
    }
    try {
      const res = await socket.emitWithAck("room:leave", { roomId: room.id });
      unwrapAck(res);
    } catch {
      // The room may already be gone; still clear local state.
    }
    clearRoom(set);
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
    const socket = get().socket;
    const room = get().room;
    if (!socket || !room) return;
    const res = await socket.emitWithAck("game:rematch-request", { roomId: room.id });
    const update = unwrapAck<RematchUpdate>(res);
    set({ rematchState: { requestedBy: update.requestedBy, active: update.active } });
  },

  acceptRematch: async () => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || !room) return;
    const res = await socket.emitWithAck("game:rematch-accept", { roomId: room.id });
    const update = unwrapAck<RematchUpdate>(res);
    set({ rematchState: { requestedBy: update.requestedBy, active: update.active } });
  },

  declineRematch: async () => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || !room) return;
    const res = await socket.emitWithAck("game:rematch-decline", { roomId: room.id });
    const update = unwrapAck<RematchUpdate>(res);
    set({ rematchState: { requestedBy: update.requestedBy, active: update.active } });
  },

  rematch: async () => {
    await get().requestRematch();
  },

  joinMatchmaking: async (gameId, stake, settings) => {
    const socket = get().socket;
    if (!socket) throw new Error("Not connected to the game server");
    set({ error: null });
    const res = await socket.emitWithAck("matchmaking:join", { gameId, stake, settings });
    const data = unwrapAck<{ position: number }>(res);
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
    
    console.log("[MultiplayerStore] Client sending game:action to room", room.id, "with action:", action);
    const res = await socket.emitWithAck("game:action", { roomId: room.id, action });
    
    if (!res.ok) {
      const errMsg = (res as { error?: { message: string } }).error?.message ?? "Action failed";
      console.log("[MultiplayerStore] Game action failed:", errMsg);
      return { ok: false, error: errMsg };
    }
    if (!res.data.ok) {
      console.log("[MultiplayerStore] Game action rejected by server:", res.data.error);
      return { ok: false, error: res.data.error ?? "Action rejected" };
    }
    
    console.log("[MultiplayerStore] Game action accepted by server, awaiting game:state broadcast");
    // State arrives via the `game:state` broadcast; applying it here too would
    // double-render the same event set on the acting client.
    return { ok: true };
  },

  clearError: () => set({ error: null }),
}));
