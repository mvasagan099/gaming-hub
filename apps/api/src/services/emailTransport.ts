/**
 * emailTransport.ts
 *
 * Singleton Nodemailer SMTP transporter for the Gaming Hub API.
 *
 * Security contract:
 *  - SMTP_PASS / SMTP_USER are NEVER logged, included in error messages,
 *    or returned to the client.
 *  - The transporter instance is created once and reused (requirement 14).
 *  - TLS/STARTTLS is enabled via `requireTLS: true` when secure=false (req 7).
 *  - This module must only ever be imported from server-side code.
 *    It must never be bundled into React, Vite, or Capacitor builds.
 */

import nodemailer, { type Transporter, type SendMailOptions } from "nodemailer";
import { env } from "../env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SmtpSendResult {
  accepted: string[];
  messageId: string;
}

// ---------------------------------------------------------------------------
// Singleton transporter
// ---------------------------------------------------------------------------

let _transporter: Transporter | null = null;

/**
 * Returns the singleton SMTP transporter.
 * Throws a safe (non-credential-leaking) error if SMTP is not configured.
 */
function getSmtpTransporter(): Transporter {
  if (_transporter) return _transporter;

  const host = env.SMTP_HOST;
  const port = env.SMTP_PORT ?? 587;
  const secure = env.SMTP_SECURE ?? false;
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;

  if (!host) {
    throw new Error("[emailTransport] SMTP_HOST is not configured");
  }
  if (!user) {
    throw new Error("[emailTransport] SMTP_USER is not configured");
  }
  if (!pass) {
    throw new Error("[emailTransport] SMTP_PASS is not configured");
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    // When secure=false and port=587, use STARTTLS upgrade (RFC 3207).
    // requireTLS forces the upgrade and rejects plaintext connections.
    ...(secure === false ? { requireTLS: true } : {}),
    auth: {
      user,
      pass,
    },
    // Force IPv4 to prevent broken IPv6 routing in Docker/Render environments
    family: 4,
    // Defensive connection timeout for Render deployments
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  } as any);

  return _transporter;
}

/**
 * Resets the singleton (for testing / graceful reconfiguration).
 * @internal
 */
export function _resetSmtpTransporter(): void {
  if (_transporter) {
    try {
      (_transporter as any).close();
    } catch {
      // ignore close errors
    }
  }
  _transporter = null;
}

// ---------------------------------------------------------------------------
// From address helper
// ---------------------------------------------------------------------------

/**
 * Returns the configured sender address.
 * Preference order: EMAIL_FROM > SMTP_FROM > hardcoded fallback.
 */
export function getFromAddress(): string {
  return env.EMAIL_FROM || env.SMTP_FROM || "noreply@gaminghub.com";
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

/**
 * Sends an email via the singleton SMTP transporter.
 *
 * Throws a safe error on failure - SMTP credentials are never included
 * in thrown messages.
 */
export async function sendSmtpEmail(options: SendEmailOptions): Promise<SmtpSendResult> {
  const transporter = getSmtpTransporter();
  const from = getFromAddress();

  const mailOptions: SendMailOptions = {
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return {
      accepted: info.accepted as string[],
      messageId: info.messageId,
    };
  } catch (err: unknown) {
    // Never surface credential details. Log only safe error code/message.
    const safeMessage = buildSafeErrorMessage(err);
    throw new Error(`[emailTransport] SMTP send failed: ${safeMessage}`);
  }
}

// ---------------------------------------------------------------------------
// Startup health check
// ---------------------------------------------------------------------------

/**
 * Verifies the SMTP connection is reachable.
 * Called during API startup when EMAIL_PROVIDER=smtp.
 *
 * Does NOT crash the API on failure (per requirement 15): logs a warning
 * instead, so transient Gmail SMTP outages do not kill the entire service.
 *
 * Returns true on success, false on failure.
 */
export async function verifySmtpConnection(
  logger?: { warn: (msg: string) => void; info: (msg: string) => void },
): Promise<boolean> {
  // Only run when SMTP is the configured provider
  if (env.EMAIL_PROVIDER !== "smtp") return true;

  try {
    const transporter = getSmtpTransporter();
    await transporter.verify();
    const log = logger?.info ?? console.log;
    log("[emailTransport] SMTP connection verified: Gmail STARTTLS ready");
    return true;
  } catch (err: unknown) {
    const safeMessage = buildSafeErrorMessage(err);
    const warn = logger?.warn ?? console.warn;
    // Warning only - SMTP outage should not crash the API
    warn(
      `[emailTransport] SMTP connection verification failed (non-fatal): ${safeMessage}. ` +
        "Email sending will be attempted when needed.",
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds a safe error message, stripping any auth-related information.
 * NEVER includes SMTP_PASS, SMTP_USER, or full connection strings.
 */
function buildSafeErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Unknown SMTP error";

  const nodeError = err as Error & { code?: string; responseCode?: number; response?: string };

  const parts: string[] = [];

  if (nodeError.code) parts.push(`code=${nodeError.code}`);
  if (nodeError.responseCode) parts.push(`responseCode=${nodeError.responseCode}`);

  // Include SMTP response text but strip lines that contain credential-related keywords.
  // Gmail 535 responses contain "username and password not accepted" — these must be stripped.
  const response = nodeError.response ?? "";
  const AUTH_KEYWORDS = ["auth", "credential", "password", "username", "login", "secret"];
  const safeResponse = response
    .split("\n")
    .filter((line) => {
      const lower = line.toLowerCase();
      return !AUTH_KEYWORDS.some((kw) => lower.includes(kw));
    })
    .slice(0, 2)
    .join(" ")
    .trim();

  if (safeResponse) parts.push(`response="${safeResponse}"`);

  // Fall back to generic message - never use err.message directly as it may
  // contain the SMTP URL (which embeds credentials in some configurations).
  return parts.length > 0 ? parts.join(", ") : "SMTP transport error (check server logs)";
}