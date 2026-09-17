/**
 * emailTransport.ts
 *
 * Unified transactional email delivery layer for the Gaming Hub API.
 *
 * Providers:
 *  - Brevo (Primary Production): HTTPS REST API (POST https://api.brevo.com/v3/smtp/email)
 *  - SMTP (Local Dev / Fallback): Singleton Nodemailer SMTP transporter
 *  - SendGrid: REST API fallback
 *  - Mock: Test / In-memory mock
 *
 * Security contract:
 *  - BREVO_API_KEY, SMTP_PASS, and raw credentials are NEVER logged,
 *    included in error messages, or returned to clients.
 *  - Brevo connects via HTTPS (port 443), operating reliably on Render Free/Paid tiers.
 *  - This module must only ever be imported from server-side code.
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

export interface EmailSendResult {
  messageId: string;
  accepted?: string[];
}

export type SmtpSendResult = EmailSendResult;

// ---------------------------------------------------------------------------
// Central Dispatcher
// ---------------------------------------------------------------------------

/**
 * Central transactional email dispatcher for Gaming Hub.
 *
 * Dispatches according to EMAIL_PROVIDER:
 *  - "brevo" (production default): Brevo HTTPS REST API (port 443)
 *  - "smtp": Nodemailer SMTP (local dev / paid instances)
 *  - "sendgrid": SendGrid REST API
 *  - "mock": In-memory dev/test mock (forbidden in production)
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
  const provider = process.env.EMAIL_PROVIDER || env.EMAIL_PROVIDER || "mock";

  switch (provider) {
    case "brevo":
      return sendBrevoEmail(options);
    case "smtp":
      return sendSmtpEmail(options);
    case "sendgrid":
      return sendSendgridEmail(options);
    case "mock":
    default:
      if (process.env.NODE_ENV === "production") {
        throw new Error("[emailTransport] Mock email provider is forbidden in production");
      }
      return {
        messageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        accepted: [options.to],
      };
  }
}

// ---------------------------------------------------------------------------
// Brevo HTTPS REST API Provider
// ---------------------------------------------------------------------------

export function getBrevoSender(): { name: string; email: string } {
  const name = (process.env.BREVO_FROM_NAME || env.BREVO_FROM_NAME || "Gaming Hub")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  const email = (
    process.env.BREVO_FROM_EMAIL ||
    env.BREVO_FROM_EMAIL ||
    process.env.EMAIL_FROM ||
    env.EMAIL_FROM ||
    process.env.SMTP_FROM ||
    env.SMTP_FROM ||
    process.env.SMTP_USER ||
    env.SMTP_USER ||
    "noreply@gaminghub.com"
  )
    .trim()
    .replace(/^['"]|['"]$/g, "");
  return { name, email };
}

/**
 * Sends an email using Brevo's HTTPS REST API.
 * Endpoint: POST https://api.brevo.com/v3/smtp/email
 *
 * Operates over HTTPS port 443 - unaffected by Render's outbound SMTP port blocks.
 * Strict credential sanitization ensures BREVO_API_KEY is never leaked.
 */
export async function sendBrevoEmail(options: SendEmailOptions): Promise<EmailSendResult> {
  const rawKey = process.env.BREVO_API_KEY || env.BREVO_API_KEY;
  if (!rawKey) {
    throw new Error("[emailTransport] BREVO_API_KEY is not configured");
  }
  const apiKey = rawKey.trim().replace(/^['"]|['"]$/g, "");

  if (apiKey.startsWith("xsmtpsib-")) {
    throw new Error(
      "[emailTransport] Configured BREVO_API_KEY is an SMTP key (starts with 'xsmtpsib-'). " +
      "Brevo's REST API requires an API key (starts with 'xkeysib-'). " +
      "In Brevo, go to 'SMTP & API' > click the 'API Keys' tab, generate a key, and update BREVO_API_KEY in Render."
    );
  }

  const sender = getBrevoSender();
  const payload = {
    sender,
    to: [{ email: options.to }],
    subject: options.subject,
    htmlContent: options.html,
    textContent: options.text,
  };

  let response: Response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (netErr: unknown) {
    const rawMsg = netErr instanceof Error ? netErr.message : "Network error";
    const safeMsg = sanitizeErrorMessage(rawMsg, [apiKey]);
    throw new Error(`[emailTransport] Brevo HTTP network request failed: ${safeMsg}`);
  }

  if (!response.ok) {
    let errorDetail = "";
    try {
      const errJson = (await response.json()) as { code?: string; message?: string };
      const code = errJson.code || "UNKNOWN";
      const rawMsg = errJson.message || response.statusText;
      const safeMsg = sanitizeErrorMessage(rawMsg, [apiKey]);
      if (response.status === 401 && /key not found/i.test(rawMsg)) {
        errorDetail = "Invalid BREVO_API_KEY ('Key not found'). Please ensure you generated an API Key (xkeysib-...) from Brevo Dashboard > SMTP & API > API Keys, and not an SMTP password.";
      } else {
        errorDetail = `code=${code}, message=${safeMsg}`;
      }
    } catch {
      errorDetail = `statusText=${response.statusText}`;
    }
    throw new Error(`[emailTransport] Brevo API error (status ${response.status}): ${errorDetail}`);
  }

  let data: { messageId?: string } = {};
  try {
    data = (await response.json()) as { messageId?: string };
  } catch {
    // Non-JSON or empty 201 response
  }

  return {
    messageId: data.messageId || `brevo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    accepted: [options.to],
  };
}

// ---------------------------------------------------------------------------
// SendGrid REST API Provider
// ---------------------------------------------------------------------------

export async function sendSendgridEmail(options: SendEmailOptions): Promise<EmailSendResult> {
  const apiKey = env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error("[emailTransport] SENDGRID_API_KEY is not configured");
  }

  const fromEmail = env.SENDGRID_FROM || env.EMAIL_FROM || env.SMTP_FROM || "noreply@gaminghub.com";
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: options.to }] }],
      from: { email: fromEmail, name: env.BREVO_FROM_NAME || "Gaming Hub" },
      subject: options.subject,
      content: [
        { type: "text/plain", value: options.text },
        { type: "text/html", value: options.html },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`[emailTransport] SendGrid API error (${res.status}): ${errText || res.statusText}`);
  }

  return {
    messageId: `sendgrid-${Date.now()}`,
    accepted: [options.to],
  };
}

// ---------------------------------------------------------------------------
// Singleton SMTP Transporter (Local Dev / Fallback)
// ---------------------------------------------------------------------------

let _transporter: Transporter | null = null;

/**
 * Returns the singleton SMTP transporter.
 * Throws a safe error if SMTP credentials are missing.
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
    ...(secure === false ? { requireTLS: true } : {}),
    auth: {
      user,
      pass,
    },
    family: 4,
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

/**
 * Returns the configured sender address.
 * Preference order: EMAIL_FROM > SMTP_FROM > SMTP_USER > hardcoded fallback.
 */
export function getFromAddress(): string {
  return env.EMAIL_FROM || env.SMTP_FROM || env.SMTP_USER || "noreply@gaminghub.com";
}

/**
 * Sends an email via the singleton SMTP transporter.
 * Maintained for local development and backwards compatibility.
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
    const safeMessage = buildSafeErrorMessage(err);
    throw new Error(`[emailTransport] SMTP send failed: ${safeMessage}`);
  }
}

// ---------------------------------------------------------------------------
// Startup health check
// ---------------------------------------------------------------------------

/**
 * Verifies the email connection is reachable.
 * Called during API startup when EMAIL_PROVIDER=smtp.
 */
export async function verifySmtpConnection(
  logger?: { warn: (msg: string) => void; info: (msg: string) => void },
): Promise<boolean> {
  if (env.EMAIL_PROVIDER !== "smtp") return true;

  try {
    const transporter = getSmtpTransporter();
    await transporter.verify();
    const log = logger?.info ?? console.log;
    log("[emailTransport] SMTP connection verified: STARTTLS ready");
    return true;
  } catch (err: unknown) {
    const safeMessage = buildSafeErrorMessage(err);
    const warn = logger?.warn ?? console.warn;
    warn(
      `[emailTransport] SMTP connection verification failed (non-fatal): ${safeMessage}. ` +
        "Email sending will be attempted when needed.",
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Internal Sanitization Helpers
// ---------------------------------------------------------------------------

function sanitizeErrorMessage(msg: string, secrets: (string | undefined)[]): string {
  let cleaned = msg;
  for (const s of secrets) {
    if (s && s.length > 4) {
      cleaned = cleaned.replaceAll(s, "[REDACTED]");
    }
  }
  const AUTH_KEYWORDS = ["api-key", "apikey", "auth", "credential", "password", "secret", "bearer"];
  return cleaned
    .split("\n")
    .filter((line) => {
      const lower = line.toLowerCase();
      return !AUTH_KEYWORDS.some((kw) => lower.includes(kw) && (lower.includes("=") || lower.includes(":")));
    })
    .join(" ")
    .trim();
}

function buildSafeErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Unknown SMTP error";

  const nodeError = err as Error & { code?: string; responseCode?: number; response?: string };
  const parts: string[] = [];

  if (nodeError.code) parts.push(`code=${nodeError.code}`);
  if (nodeError.responseCode) parts.push(`responseCode=${nodeError.responseCode}`);

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
  return parts.length > 0 ? parts.join(", ") : "SMTP transport error (check server logs)";
}