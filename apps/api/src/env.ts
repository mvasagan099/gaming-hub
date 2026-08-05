import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  INTERNAL_API_KEY: z.string().min(8, "INTERNAL_API_KEY must be at least 8 characters"),
  CORS_ORIGIN: z.string().default("*"),
  RATE_LIMIT_MAX: z.coerce.number().default(300),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  BODY_LIMIT: z.coerce.number().default(262_144),
  // "true" (default in production) rejects access tokens whose email is not
  // yet verified. Supabase projects should enable email confirmation.
  REQUIRE_EMAIL_VERIFICATION: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  requireEmailVerification:
    parsed.data.REQUIRE_EMAIL_VERIFICATION ?? parsed.data.NODE_ENV === "production",
};
