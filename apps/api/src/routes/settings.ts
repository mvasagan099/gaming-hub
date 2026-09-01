import type { FastifyInstance } from "fastify";
import { getPublicSettings } from "../services/settings";

/**
 * Public site configuration. Unauthenticated, aggressively cacheable, and
 * always strips secret keys (API keys, SMTP passwords, webhook secrets).
 * The frontend reads this at boot to render branding, locale defaults, the
 * maintenance banner, and feature gates without an authenticated round-trip.
 */
export async function settingsRoutes(app: FastifyInstance) {
  app.get(
    "/api/settings",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (_request, reply) => {
      const settings = await getPublicSettings();
      // Public + nearly static; let clients/CDN cache for a minute.
      reply.header("Cache-Control", "public, max-age=60");
      return settings;
    },
  );
}
