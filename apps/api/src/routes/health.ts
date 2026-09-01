import type { FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";

const SERVICE = "gaming-hub-api";

function liveness() {
  return {
    status: "ok",
    service: SERVICE,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}

async function databaseCheck() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "up";
  } catch {
    return "down";
  }
}

export async function healthRoutes(app: FastifyInstance) {
  // Liveness: the process is up and accepting requests.
  app.get("/health/live", async () => liveness());

  // Readiness: dependencies (database) are reachable. Used by orchestrators.
  app.get("/health/ready", async (_request, reply) => {
    const database = await databaseCheck();
    if (database !== "up") {
      return reply
        .status(503)
        .send({ status: "not_ready", service: SERVICE, checks: { database } });
    }
    return reply.send({ status: "ready", service: SERVICE, checks: { database } });
  });

  // Backwards-compatible summary endpoint.
  app.get("/health", async (_request, reply) => {
    const database = await databaseCheck();
    const body = { ...liveness(), checks: { database } };
    return database === "up" ? body : reply.status(503).send(body);
  });
}
