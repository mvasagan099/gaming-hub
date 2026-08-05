import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    status: "ok",
    service: "gaming-hub-api",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));
}
