import { env } from "../env";

const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL ?? "http://localhost:4001";

interface BridgeCall {
  userId: string;
  event: string;
  payload: Record<string, unknown>;
}

/**
 * Captures outbound socket notifications in test mode so integration tests can
 * assert that wallet changes are synchronized without running a socket server.
 * In production the notifications go over HTTP to the socket server.
 */
export const socketBridge: { calls: BridgeCall[] } = { calls: [] };

export function resetSocketBridge(): void {
  socketBridge.calls = [];
}

/**
 * Fire-and-forget push to a user's live socket connections via the socket
 * server's internal notify endpoint. Never throws: a transient bridge failure
 * must not fail the money-moving request that triggered it.
 */
export async function notifyUserSocket(
  userId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    socketBridge.calls.push({ userId, event, payload });
    return;
  }

  try {
    await fetch(`${SOCKET_SERVER_URL}/internal/notify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-key": env.INTERNAL_API_KEY,
      },
      body: JSON.stringify({ userId, event, payload }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Fire-and-forget bridge; failures are intentionally swallowed.
  }
}
