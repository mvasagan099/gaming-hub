import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
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
import { internalRoutes } from "./routes/internal";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty", options: { colorize: true } } }
        : {}),
    },
    trustProxy: true,
  });

  void app.register(helmet, { contentSecurityPolicy: false });

  void app.register(cors, {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
    credentials: true,
  });

  void app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    errorResponseBuilder: (_req, context) => ({
      error: {
        code: "RATE_LIMITED",
        message: `Rate limit exceeded, retry in ${context.after}`,
      },
    }),
  });

  registerErrorHandler(app);

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
  void app.register(internalRoutes);

  return app;
}
