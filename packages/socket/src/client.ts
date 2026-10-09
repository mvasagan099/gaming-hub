import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "./events";

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface CreateSocketOptions {
  url?: string;
  /**
   * Static token, or a live getter that returns the most recent token. A
   * getter is recommended so Supabase access-token refreshes are picked up on
   * every reconnection attempt without recreating the socket.
   */
  token: string | (() => string | null);
  /** Reconnect delay base in ms (socket.io default is 1000). */
  reconnectionDelay?: number;
  /** Max reconnect delay in ms. */
  reconnectionDelayMax?: number;
  reconnectionAttempts?: number;
}

/**
 * Creates a Socket.IO connection authenticated with a bearer token and
 * preconfigured for resilient reconnects. `auth` is a function so the latest
 * (refreshed) token is used on every reconnection attempt.
 */
export function createTypedSocket(options: CreateSocketOptions): TypedSocket {
  return io(options.url || undefined, {
    transports: ["websocket", "polling"],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: options.reconnectionAttempts ?? Number.POSITIVE_INFINITY,
    reconnectionDelay: options.reconnectionDelay ?? 1000,
    reconnectionDelayMax: options.reconnectionDelayMax ?? 10000,
    auth: (cb) => {
      const token = typeof options.token === "function" ? options.token() : options.token;
      cb({ token: token ?? undefined });
    },
  });
}
