export const ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "ROOM_FULL",
  "ROOM_NOT_FOUND",
  "ROOM_CLOSED",
  "ALREADY_IN_ROOM",
  "NOT_HOST",
  "CANNOT_START",
  "NOT_IN_ROOM",
  "INVALID_ACTION",
  "NOT_YOUR_TURN",
  "GAME_NOT_STARTED",
  "MATCH_FINISHED",
  "INSUFFICIENT_BALANCE",
  "ALREADY_QUEUED",
  "NOT_IN_QUEUE",
  "MATCHMAKING_OFFLINE",
  "ACCOUNT_DELETED",
  "EMAIL_NOT_VERIFIED",
  "ACCOUNT_LOCKED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function toApiError(error: unknown): ApiErrorBody {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }
  return {
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  };
}
