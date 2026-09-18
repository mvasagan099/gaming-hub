import { AuthError } from "@supabase/supabase-js";
import { ApiError } from "../services/api/client";

export interface NormalizedAuthError {
  code: string;
  status: number | null;
  message: string;
  userMessage: string;
}

/**
 * Normalizes all Supabase Auth, API, Network, and Unknown errors into safe,
 * user-friendly error messages while preserving technical context for logging.
 */
export function getAuthErrorDetails(error: unknown): NormalizedAuthError {
  let code = "UNKNOWN_ERROR";
  let status: number | null = null;
  let rawMessage = "An unexpected error occurred.";

  if (error instanceof AuthError) {
    code = error.code || (error as { error_code?: string }).error_code || "AUTH_ERROR";
    status = error.status || null;
    rawMessage = error.message;
  } else if (error instanceof ApiError) {
    code = error.code || "API_ERROR";
    status = error.status;
    rawMessage = error.message;
  } else if (error instanceof TypeError && error.message.includes("fetch")) {
    code = "NETWORK_ERROR";
    status = 0;
    rawMessage = "Failed to fetch / network disconnected";
  } else if (error instanceof Error) {
    code = (error as { code?: string }).code || "ERROR";
    status = (error as { status?: number }).status || null;
    rawMessage = error.message;
  } else if (typeof error === "string") {
    rawMessage = error;
  }

  const normalized = rawMessage.toLowerCase();

  // 1. Network / Connectivity Errors
  if (
    code === "NETWORK_ERROR" ||
    normalized.includes("failed to fetch") ||
    normalized.includes("network error") ||
    normalized.includes("offline") ||
    normalized.includes("networkrequestfailed")
  ) {
    return {
      code: "NETWORK_ERROR",
      status: status ?? 0,
      message: rawMessage,
      userMessage: "Unable to connect to Gaming Hub. Please check your internet connection and try again.",
    };
  }

  // 2. Email Delivery / SMTP / Server 500 Failures
  if (
    normalized.includes("error sending recovery email") ||
    normalized.includes("error sending confirmation email") ||
    normalized.includes("error sending email") ||
    normalized.includes("smtp") ||
    normalized.includes("email provider")
  ) {
    return {
      code: "EMAIL_DELIVERY_ERROR",
      status: status ?? 500,
      message: rawMessage,
      userMessage: "We couldn't send the email right now. Please try again later.",
    };
  }

  // 3. Rate Limit / Too Many Requests
  if (
    status === 429 ||
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("email rate limit exceeded")
  ) {
    return {
      code: "RATE_LIMIT",
      status: 429,
      message: rawMessage,
      userMessage: "Too many requests. Please wait a few minutes and try again.",
    };
  }

  // 4. Invalid Login Credentials
  if (
    code === "invalid_credentials" ||
    code === "invalid_grant" ||
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid email or password") ||
    normalized.includes("user not found") ||
    normalized.includes("wrong password")
  ) {
    return {
      code: "INVALID_CREDENTIALS",
      status: status ?? 400,
      message: rawMessage,
      userMessage: "Invalid email or password. Please check your credentials and try again.",
    };
  }

  // 5. Email Not Confirmed
  if (
    code === "email_not_confirmed" ||
    normalized.includes("email not confirmed") ||
    normalized.includes("unconfirmed email") ||
    normalized.includes("email address has not been verified")
  ) {
    return {
      code: "EMAIL_NOT_CONFIRMED",
      status: status ?? 400,
      message: rawMessage,
      userMessage: "Please confirm your email address before signing in.",
    };
  }

  // 6. Expired or Invalid Reset Link / Token
  if (
    code === "otp_expired" ||
    normalized.includes("token has expired") ||
    normalized.includes("link has expired") ||
    normalized.includes("recovery link has expired")
  ) {
    return {
      code: "EXPIRED_LINK",
      status: status ?? 400,
      message: rawMessage,
      userMessage: "This password reset link has expired. Please request a new one.",
    };
  }

  if (
    code === "bad_oauth_callback" ||
    code === "bad_jwt" ||
    normalized.includes("invalid token") ||
    normalized.includes("invalid link") ||
    normalized.includes("token is invalid or has expired") ||
    normalized.includes("invalid claim")
  ) {
    return {
      code: "INVALID_LINK",
      status: status ?? 400,
      message: rawMessage,
      userMessage: "This password reset link is invalid or has already been used. Please request a new one.",
    };
  }

  // 7. Duplicate Email on Signup
  if (
    code === "user_already_exists" ||
    normalized.includes("user already registered") ||
    normalized.includes("user already exists") ||
    normalized.includes("email address is already in use") ||
    normalized.includes("duplicate key value")
  ) {
    return {
      code: "USER_ALREADY_EXISTS",
      status: status ?? 400,
      message: rawMessage,
      userMessage: "An account with this email already exists. Please sign in instead.",
    };
  }

  // 8. Invalid Email Format
  if (
    code === "validation_failed" && normalized.includes("email") ||
    normalized.includes("invalid email") ||
    normalized.includes("unable to validate email address")
  ) {
    return {
      code: "INVALID_EMAIL",
      status: status ?? 400,
      message: rawMessage,
      userMessage: "Please enter a valid email address.",
    };
  }

  // 9. Weak Password
  if (
    code === "weak_password" ||
    normalized.includes("password should be at least") ||
    normalized.includes("password is too weak") ||
    normalized.includes("password must be")
  ) {
    return {
      code: "WEAK_PASSWORD",
      status: status ?? 400,
      message: rawMessage,
      userMessage: "Your password does not meet the required security requirements.",
    };
  }

  // 10. Account Disabled / Blocked
  if (
    code === "user_banned" ||
    normalized.includes("user is banned") ||
    normalized.includes("account is disabled") ||
    normalized.includes("account is suspended")
  ) {
    return {
      code: "ACCOUNT_SUSPENDED",
      status: status ?? 403,
      message: rawMessage,
      userMessage: "This account has been suspended. Please contact support.",
    };
  }

  // 11. Generic Server 5xx Errors
  if (status && status >= 500) {
    return {
      code: "SERVER_ERROR",
      status,
      message: rawMessage,
      userMessage: "Gaming Hub is temporarily unable to process this request. Please try again later.",
    };
  }

  // 12. Fallback
  return {
    code,
    status,
    message: rawMessage,
    userMessage: "Something went wrong. Please try again later.",
  };
}

/**
 * Convenience helper returning only the safe user-facing message.
 */
export function getAuthErrorMessage(error: unknown): string {
  return getAuthErrorDetails(error).userMessage;
}

/**
 * Safe logger for authentication errors (ensures sensitive tokens and passwords are never logged).
 */
export function logAuthError(context: string, error: unknown): void {
  const details = getAuthErrorDetails(error);
  console.error(`[AUTH:${context}]`, {
    code: details.code,
    status: details.status,
    rawMessage: details.message,
    userMessage: details.userMessage,
  });
}
