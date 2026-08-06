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
import { createTypedSocket, type TypedSocket } from "@gaming-hub/socket";
import { useAuthStore } from "./authStore";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL as string;

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
  matchmaking: MatchmakingInfo;
  /** Queue intent preserved across transient reconnects so it can be re-joined. */
  pendingRequeue: { gameId: GameId; stake: number; settings: MatchSettings } | null;
  gameState: JsonObject | null;
  lastEvents: { type: string }[];
  matchId: string | null;
  winner: WinnerInfo | null;
  // Force re-render counter for deep state changes
  renderKey: number;

  connect: () => void;
  disconnect: () => void;
  createRoom: (gameId: GameId, isPrivate: boolean, stake: number, maxPlayers?: number, settings?: MatchSettings) => Promise<RoomFull>;
  joinRoom: (input: { roomId?: string; code?: string; asSpectator?: boolean }) => Promise<RoomFull>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<RoomFull | null>;
  startGame: () => Promise<RoomFull | null>;
  rematch: () => Promise<void>;
  joinMatchmaking: (gameId: GameId, stake: number, settings?: MatchSettings) => Promise<void>;
  leaveMatchmaking: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  sendEmoji: (emoji: string) => Promise<void>;
  sendGameAction: (action: GameAction) => Promise<{ ok: boolean; error?: string }>;}

function sessionToken(): string | null {
  return useAuthStore.getState().session?.access_token ?? null;
}

function unwrapAck<T>(res: AckResult<T>): T {
  if (res.ok) return res.data;
  throw new Error(res.error.message);
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
  matchmaking: { ...IDLE_MATCHMAKING },
  pendingRequeue: null,
  gameState: null,
  lastEvents: [],
  matchId: null,
  winner: null,
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
        
        // Always increment renderKey and ensure proper state update
        set({
          gameState: payload.state,
          lastEvents: payload.events,
          matchId: payload.matchId,
          winner: null,
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
          renderKey: get().renderKey + 1, // Force re-render
        });
      });

      socket.on("chat:message", (message) => {
        set({ messages: [...get().messages.slice(-199), message] });
      });

      socket.on("chat:emoji", (emoji) => {
        set({ emojis: [...get().emojis.slice(-9), emoji] });
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
    const res = await socket.emitWithAck("room:create", { gameId, isPrivate, stake, maxPlayers, settings });
    const room = unwrapAck<RoomFull>(res);
    applyRoom(set, room);
    set({ winner: null, matchmaking: { ...IDLE_MATCHMAKING }, pendingRequeue: null });
    return room;
  },

  joinRoom: async (input) => {
    const socket = get().socket;
    if (!socket) throw new Error("Not connected to the game server");
    const res = await socket.emitWithAck("room:join", {
      roomId: input.roomId,
      code: input.code,
      asSpectator: input.asSpectator ?? false,
    });
    const room = unwrapAck<RoomFull>(res);
    applyRoom(set, room);
    set({ winner: null, matchmaking: { ...IDLE_MATCHMAKING }, pendingRequeue: null });
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

  rematch: async () => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || !room) return;
    const res = await socket.emitWithAck("game:rematch", { roomId: room.id });
    const updated = unwrapAck<RoomFull>(res);
    applyRoom(set, updated);
  },

  joinMatchmaking: async (gameId, stake, settings) => {
    const socket = get().socket;
    if (!socket) throw new Error("Not connected to the game server");
    const res = await socket.emitWithAck("matchmaking:join", { gameId, stake, settings });
    const data = unwrapAck<{ position: number }>(res);
    set({
      matchmaking: { queued: true, position: data.position, gameId, stake, settings: settings ?? {} },
      pendingRequeue: null,
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

  sendGameAction: async (action) => {
    const socket = get().socket;
    const room = get().room;
    if (!socket || !room) return { ok: false, error: "You are not in a room" };
    
    console.log("[MultiplayerStore] Client sending game:action to room", room.id, "with action:", action);
    const res = await socket.emitWithAck("game:action", { roomId: room.id, action });
    
    if (!res.ok) {
      console.log("[MultiplayerStore] Game action failed:", res.error.message);
      return { ok: false, error: res.error.message };
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
}));
