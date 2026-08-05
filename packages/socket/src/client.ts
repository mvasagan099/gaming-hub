import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "./events";

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface CreateSocketOptions {
  url: string;
  token: string;
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
  return io(options.url, {
    transports: ["websocket", "polling"],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: options.reconnectionAttempts ?? Number.POSITIVE_INFINITY,
    reconnectionDelay: options.reconnectionDelay ?? 1000,
    reconnectionDelayMax: options.reconnectionDelayMax ?? 10000,
    auth: (cb) => cb({ token: options.token }),
  });
}
