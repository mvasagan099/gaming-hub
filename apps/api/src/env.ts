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
  // Email configuration (SMTP / SendGrid / SES)
  EMAIL_PROVIDER: z.enum(["smtp", "sendgrid", "ses", "mock"]).optional().default("mock"),
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
  // Set to 0 if there is no reverse proxy (direct deployment), 1 for a single
  // load balancer / Nginx / Cloudflare, or higher for multi-hop setups.
  // Unconditionally trusting all hops (trustProxy: true) allows IP spoofing.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
}).superRefine((data, ctx) => {
  // 1. Prevent mock email provider from being used in production
  if (data.NODE_ENV === "production" && (!data.EMAIL_PROVIDER || data.EMAIL_PROVIDER === "mock")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["EMAIL_PROVIDER"],
      message: "EMAIL_PROVIDER must be explicitly configured as 'sendgrid', 'smtp', or 'ses' in production. 'mock' email transport is forbidden in production.",
    });
  }

  // 2. Validate Email Provider credentials when in production mode
  if (data.NODE_ENV === "production" && data.EMAIL_PROVIDER === "sendgrid" && !data.SENDGRID_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SENDGRID_API_KEY"],
      message: "SENDGRID_API_KEY is required when EMAIL_PROVIDER is 'sendgrid' in production",
    });
  }

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
  if (data.NODE_ENV === "production" && data.INTERNAL_API_KEY.length < 16) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["INTERNAL_API_KEY"],
      message: "INTERNAL_API_KEY must be at least 16 characters in production for security",
    });
  }

  // 6. MEDIUM-3 fix: require SUPABASE_SERVICE_ROLE_KEY in production for KYC storage.
  if (data.NODE_ENV === "production" && !data.SUPABASE_SERVICE_ROLE_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SUPABASE_SERVICE_ROLE_KEY"],
      message: "SUPABASE_SERVICE_ROLE_KEY is required in production. KYC document storage will not work without it.",
    });
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
