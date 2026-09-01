// packages/anti-cheat/src/logging.ts

/** Simple wrapper for logging anti‑cheat events */
import { logger } from "./logger";

export function logEvent(event: string, action: any, reason: string): void {
  // Log a structured message for monitoring and debugging
  logger.info(`[ANTI‑CHEAT] ${event}`, {
    actionId: action?.actionId ?? null,
    playerId: action?.playerId ?? null,
    matchId: action?.matchId ?? null,
    reason,
  });
}
