import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Load local .env first
dotenv.config();

// Fallback to monorepo root .env if running from apps/api
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(currentDir, "../../../.env");
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  // MEDIUM-3 fix: require the service role key so KYC storage can't silently fail.
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  INTERNAL_API_KEY: z.string().min(8, "INTERNAL_API_KEY must be at least 8 characters"),
  CORS_ORIGIN: z.string().default("*"),
  RATE_LIMIT_MAX: z.coerce.number().default(300),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  BODY_LIMIT: z.coerce.number().default(262_144),
  // Email configuration (Brevo HTTP / SMTP / SendGrid / SES)
  EMAIL_PROVIDER: z.enum(["brevo", "smtp", "sendgrid", "ses", "mock"]).optional().default("mock"),
  BREVO_API_KEY: z.string().optional(),
  BREVO_FROM_EMAIL: z.string().optional(),
  BREVO_FROM_NAME: z.string().optional().default("Gaming Hub"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // EMAIL_FROM is the canonical sender address used for all email providers.
  // SMTP_FROM is kept for backward compatibility and used as a fallback.
  EMAIL_FROM: z.string().optional(),
  SMTP_FROM: z.string().optional().default("noreply@gaminghub.com"),
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM: z.string().optional(),
  AWS_SES_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  SES_FROM: z.string().optional(),
  REDIS_URL: z.string().optional().default(""),
  DB_CONNECTION_LIMIT: z.coerce.number().optional().default(20),
  // "true" (default in production) rejects access tokens whose email is not
  // yet verified. Supabase projects should enable email confirmation.
  REQUIRE_EMAIL_VERIFICATION: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  // CouponVault Integration Configuration
  COUPON_API_URL: z.string().url().optional().default("http://127.0.0.1:4000/api/v1"),
  COUPON_API_KEY: z.string().default("dev-fallback-key-123"),
  // M-07 fix: constrain how many X-Forwarded-For hops are trusted.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  // M-05: AES-256-GCM key for encrypting TOTP secrets at rest.
  // Production: must be exactly 32 cryptographically random bytes, base64-encoded.
  // Generate: node -e "require('crypto').randomBytes(32).toString('base64')" | pbcopy
  TOTP_ENCRYPTION_KEY: z.string().optional(),
  // Key version for safe rotation support (increment when rotating the key).
  TOTP_ENCRYPTION_KEY_VERSION: z.coerce.number().int().min(1).default(1),
  // C-02: How long (minutes) a completed MFA verification remains valid for
  // high-risk operations. Default: 15 minutes.
  MFA_FRESHNESS_MINUTES: z.coerce.number().int().min(1).default(15),
}).superRefine((data, ctx) => {
  // 1. Prevent mock email provider from being used in production
  if (data.NODE_ENV === "production" && (!data.EMAIL_PROVIDER || data.EMAIL_PROVIDER === "mock")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["EMAIL_PROVIDER"],
      message: "EMAIL_PROVIDER must be explicitly configured as 'brevo', 'sendgrid', 'smtp', or 'ses' in production. 'mock' email transport is forbidden in production.",
    });
  }

  // 2. Validate Brevo credentials when EMAIL_PROVIDER=brevo in production mode
  if (data.NODE_ENV === "production" && data.EMAIL_PROVIDER === "brevo") {
    if (!data.BREVO_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BREVO_API_KEY"],
        message: "BREVO_API_KEY is required when EMAIL_PROVIDER is 'brevo' in production",
      });
    }
    if (!data.BREVO_FROM_EMAIL && !data.EMAIL_FROM && !data.SMTP_FROM) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BREVO_FROM_EMAIL"],
        message: "BREVO_FROM_EMAIL (or EMAIL_FROM) is required when EMAIL_PROVIDER is 'brevo' in production",
      });
    }
  }

  // 3. Validate SendGrid credentials when in production mode
  if (data.NODE_ENV === "production" && data.EMAIL_PROVIDER === "sendgrid" && !data.SENDGRID_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SENDGRID_API_KEY"],
      message: "SENDGRID_API_KEY is required when EMAIL_PROVIDER is 'sendgrid' in production",
    });
  }

  // 4. Validate SMTP credentials when in production mode
  if (data.NODE_ENV === "production" && data.EMAIL_PROVIDER === "smtp") {
    const missingSmtp: string[] = [];
    if (!data.SMTP_HOST) missingSmtp.push("SMTP_HOST");
    if (!data.SMTP_USER) missingSmtp.push("SMTP_USER");
    if (!data.SMTP_PASS) missingSmtp.push("SMTP_PASS");
    // EMAIL_FROM is required; SMTP_FROM is accepted as a legacy alias
    if (!data.EMAIL_FROM && !data.SMTP_FROM) missingSmtp.push("EMAIL_FROM");

    for (const field of missingSmtp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} is required when EMAIL_PROVIDER is 'smtp' in production`,
      });
    }
  }

  // 3. Validate CORS_ORIGIN in production (must not be wildcard "*")
  if (data.NODE_ENV === "production" && (data.CORS_ORIGIN === "*" || !data.CORS_ORIGIN.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["CORS_ORIGIN"],
      message: "CORS_ORIGIN must specify an explicit production domain (e.g. 'https://app.gaminghub.com'), wildcard '*' is forbidden in production.",
    });
  }

  if (data.NODE_ENV === "production") {
    if (data.COUPON_API_KEY === "dev-fallback-key-123") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["COUPON_API_KEY"], message: "COUPON_API_KEY must be configured in production" });
    }
    try {
      const couponUrl = new URL(data.COUPON_API_URL);
      if (couponUrl.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(couponUrl.hostname)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["COUPON_API_URL"], message: "COUPON_API_URL must be a non-local HTTPS endpoint in production" });
      }
    } catch { /* URL validation is handled by the schema */ }
  }

  // 4. Validate Redis URL format if specified
  if (data.REDIS_URL && data.REDIS_URL.trim().length > 0) {
    if (!data.REDIS_URL.startsWith("redis://") && !data.REDIS_URL.startsWith("rediss://")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message: "REDIS_URL must start with redis:// or rediss://",
      });
    }
  }

  // 5. Prevent insecure or short secret in production
  const DISALLOWED_DEV_KEYS = [
    "gaming-hub-internal-dev-key",
    "dev-internal-secret-key-12345",
    "internal-secret-key-123",
    "dev-fallback-key-123",
    "generate-a-long-random-secret-min-16-chars",
    "must-match-the-api-internal-key",
  ];
  if (data.NODE_ENV === "production") {
    if (data.INTERNAL_API_KEY.length < 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INTERNAL_API_KEY"],
        message: "INTERNAL_API_KEY must be at least 16 characters in production for security",
      });
    }
    if (DISALLOWED_DEV_KEYS.includes(data.INTERNAL_API_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INTERNAL_API_KEY"],
        message: "INTERNAL_API_KEY cannot use known development default keys in production",
      });
    }
  }

  // 6. MEDIUM-3 fix: require SUPABASE_SERVICE_ROLE_KEY in production for KYC storage.
  if (data.NODE_ENV === "production" && !data.SUPABASE_SERVICE_ROLE_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SUPABASE_SERVICE_ROLE_KEY"],
      message: "SUPABASE_SERVICE_ROLE_KEY is required in production. KYC document storage will not work without it.",
    });
  }

  // 7. M-05: require TOTP_ENCRYPTION_KEY in production so secrets are never stored plaintext.
  if (data.NODE_ENV === "production" && !data.TOTP_ENCRYPTION_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["TOTP_ENCRYPTION_KEY"],
      message:
        "TOTP_ENCRYPTION_KEY is required in production. " +
        "Generate: node -e \"require('crypto').randomBytes(32).toString('base64')\" and set this env var.",
    });
  }

  // 8. M-05: validate TOTP_ENCRYPTION_KEY length when provided (must decode to 32 bytes).
  if (data.TOTP_ENCRYPTION_KEY) {
    const keyBytes = Buffer.from(data.TOTP_ENCRYPTION_KEY, "base64");
    if (keyBytes.length !== 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TOTP_ENCRYPTION_KEY"],
        message: `TOTP_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${keyBytes.length}). ` +
          "Generate: node -e \"require('crypto').randomBytes(32).toString('base64')\"",
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:", JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  requireEmailVerification:
    parsed.data.REQUIRE_EMAIL_VERIFICATION ?? parsed.data.NODE_ENV === "production",
};
