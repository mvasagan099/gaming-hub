import type { FastifyInstance } from "fastify";
import { getFeatureFlags } from "../services/featureFlags";

/**
 * Public feature-flag snapshot for the SPA. This is intentionally
 * unauthenticated so the client can hide/disable surfaces before the user
 * ever logs in (and so it stays reachable during maintenance mode).
 */
export async function featureFlagsRoutes(app: FastifyInstance) {
  app.get("/api/feature-flags", async () => getFeatureFlags());
}
