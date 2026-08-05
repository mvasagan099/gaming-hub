import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { AppError } from "@gaming-hub/shared";
import { env } from "./env";
import { registerErrorHandler } from "./plugins/errors";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { usersRoutes } from "./routes/users";
import { friendsRoutes } from "./routes/friends";
import { roomsRoutes } from "./routes/rooms";
import { matchesRoutes } from "./routes/matches";
import { leaderboardRoutes } from "./routes/leaderboard";
import { walletRoutes } from "./routes/wallet";
import { notificationsRoutes } from "./routes/notifications";
import { achievementsRoutes } from "./routes/achievements";
import { adminRoutes } from "./routes/admin";
import { settingsRoutes } from "./routes/settings";
import { internalRoutes } from "./routes/internal";
import { accountRoutes } from "./routes/account";
import { metricsRoutes } from "./routes/metrics";
import { instrument } from "./services/metrics";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty", options: { colorize: true } } }
        : {}),
    },
    trustProxy: true,
    // Reject oversized JSON payloads (defense against body abuse). The API has
    // no file-upload surface yet; raise via env.BODY_LIMIT when one is added.
    bodyLimit: env.BODY_LIMIT,
    // Cap route parameter length to prevent pathological URLs/ReDoS.
    maxParamLength: 100,
  });

  // Security headers. This service returns JSON only, so a fully locked-down
  // CSP is safe and cannot interfere with the SPA (which is served elsewhere).
  void app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: "no-referrer" },
  });

  void app.register(cors, {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Internal-Key", "X-Requested-With"],
  });

  void app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    // The plugin throws whatever this builder returns, so return an AppError
    // for our error handler to translate into a proper 429 response.
    errorResponseBuilder: (_req, context) =>
      new AppError(
        "RATE_LIMITED",
        `Rate limit exceeded, retry in ${context.after}`,
        429,
      ),
  });

  registerErrorHandler(app);

  instrument(app);

  void app.register(healthRoutes);
  void app.register(authRoutes);
  void app.register(usersRoutes);
  void app.register(friendsRoutes);
  void app.register(roomsRoutes);
  void app.register(matchesRoutes);
  void app.register(leaderboardRoutes);
  void app.register(walletRoutes);
  void app.register(notificationsRoutes);
  void app.register(achievementsRoutes);
  void app.register(adminRoutes);
  void app.register(settingsRoutes);
  void app.register(internalRoutes);
  void app.register(accountRoutes);
  void app.register(metricsRoutes);

  return app;
}
