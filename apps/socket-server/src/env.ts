import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4001),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  INTERNAL_API_KEY: z.string().min(8, "INTERNAL_API_KEY must be at least 8 characters"),
  API_URL: z.string().url("API_URL must be a valid URL"),
  CORS_ORIGIN: z.string().default("*"),
  REDIS_URL: z.string().optional().default(""),
  LOG_LEVEL: z.string().default("info"),
  // "true" (default in production) rejects sockets whose email is unverified.
  REQUIRE_EMAIL_VERIFICATION: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
}).superRefine((data, ctx) => {
  // Validate Redis URL format if specified
  if (data.REDIS_URL && data.REDIS_URL.trim().length > 0) {
    if (!data.REDIS_URL.startsWith("redis://") && !data.REDIS_URL.startsWith("rediss://")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message: "REDIS_URL must start with redis:// or rediss://",
      });
    }
  }

  // Validate CORS_ORIGIN in production (must not be wildcard "*")
  if (data.NODE_ENV === "production" && (data.CORS_ORIGIN === "*" || !data.CORS_ORIGIN.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["CORS_ORIGIN"],
      message: "CORS_ORIGIN must specify an explicit production domain (e.g. 'https://app.gaminghub.com'), wildcard '*' is forbidden in production.",
    });
  }

  // Prevent weak internal secret in production
  if (data.NODE_ENV === "production" && data.INTERNAL_API_KEY.length < 16) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["INTERNAL_API_KEY"],
      message: "INTERNAL_API_KEY must be at least 16 characters in production for security",
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid socket-server environment configuration:", JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  requireEmailVerification:
    parsed.data.REQUIRE_EMAIL_VERIFICATION ?? parsed.data.NODE_ENV === "production",
};
