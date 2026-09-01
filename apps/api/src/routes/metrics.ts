import type { FastifyInstance } from "fastify";
import { AppError } from "@gaming-hub/shared";
import { env } from "../env";
import { metricsText } from "../services/metrics";

/**
 * Prometheus scrape endpoint. Gated by the shared internal key so the socket
 * server / monitoring agent can authenticate the same way it calls /internal/*.
 */
export async function metricsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request, _reply) => {
    const key = request.headers["x-internal-key"];
    if (key !== env.INTERNAL_API_KEY) {
      throw new AppError("UNAUTHORIZED", "Invalid internal key", 401);
    }
  });

  app.get("/metrics", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (_request, reply) => {
    reply.type("text/plain; version=0.0.4; charset=utf-8");
    return metricsText();
  });
}
