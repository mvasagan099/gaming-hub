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
  "INSUFFICIENT_COINS",
  "ALREADY_QUEUED",
  "NOT_IN_QUEUE",
  "MATCHMAKING_OFFLINE",
  "MATCHMAKING_TIMEOUT",
  "MATCHMAKING_ERROR",
  "ACCOUNT_DELETED",
  "EMAIL_NOT_VERIFIED",
  "ACCOUNT_LOCKED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "FEATURE_DISABLED",
  "MAINTENANCE",
  "WALLET_LIMIT_EXCEEDED",
  "WALLET_FROZEN",
  "OTP_REQUIRED",
  "OTP_INVALID",
  "OTP_EXPIRED",
  "OTP_TOO_MANY_ATTEMPTS",
  "WALLET_REQUEST_NOT_FOUND",
  "WALLET_REQUEST_ALREADY_DECIDED",
  "DAILY_WITHDRAWAL_LIMIT_EXCEEDED",
  "ALREADY_REFERRED",
  "INVALID_REFERRAL_CODE",
  "SELF_REFERRAL",
  "COUPON_INVALID",
  "COUPON_EXPIRED",
  "COUPON_ALREADY_USED",
  "COUPON_MAX_USES_REACHED",
  "TOURNAMENT_FULL",
  "TOURNAMENT_ALREADY_REGISTERED",
  "TOURNAMENT_STARTED",
  "TOURNAMENT_LOCKED",
  "MESSAGE_SELF_SEND",
  "USER_BLOCKED",
  "CONVERSATION_NOT_FOUND",
  "CONVERSATION_FULL",
  "SEARCH_QUERY_REQUIRED",
  "KYC_REQUIRED",
  "WITHDRAWAL_NOT_ALLOWED",
  "WITHDRAWAL_LIMIT_EXCEEDED",
  "KYC_REQUEST_NOT_FOUND",
  "KYC_ALREADY_APPROVED",
  "KYC_DOCUMENT_REQUIRED",
  "GAME_DISABLED",
  "ONLINE_DISABLED",
  "INVALID_ENTRY_FEE",
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
