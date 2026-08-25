import { z } from "zod";
import { GAME_IDS } from "./games";

export const SECURITY_EVENT_TYPES = [
  "IMPOSSIBLE_ACTION",
  "RATE_LIMIT_EXCEEDED",
  "STALE_ACTION_SPAM",
  "INVALID_STATE",
  "DUPLICATE_ACTION_SPAM",
  "RECONNECT_ABUSE",
  "SOCKET_AUTH_FAILURE",
  "IMPOSSIBLE_MOVEMENT",
  "SCORE_TAMPERING_ATTEMPT",
  "TIMER_TAMPERING_ATTEMPT",
  "WRONG_TURN",
  "ROOM_SPOOFING",
  "CLIENT_FORGED_WINNER",
] as const;

export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export const SECURITY_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type SecuritySeverity = (typeof SECURITY_SEVERITIES)[number];

export interface SecurityEventRecord {
  id: string;
  matchId?: string;
  roomId?: string;
  userId: string;
  gameId?: string;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  details: Record<string, unknown>;
  actionTaken: "LOG" | "RATE_LIMIT" | "REJECT_ACTION" | "FLAGGED_FOR_REVIEW";
  timestamp: number;
}

export const securityEventQuerySchema = z.object({
  gameId: z.enum(GAME_IDS).optional(),
  userId: z.string().optional(),
  matchId: z.string().optional(),
  eventType: z.enum(SECURITY_EVENT_TYPES).optional(),
  severity: z.enum(SECURITY_SEVERITIES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});
