import { buildApp } from "./app";
import { env } from "./env";
import { prisma } from "@gaming-hub/db";

async function main() {
  const app = buildApp();

  try {
    await prisma.$connect();
    app.log.info("Database connected");
  } catch (error) {
    app.log.error({ error }, "Failed to connect to database");
    process.exit(1);
  }

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (error) {
    app.log.error({ error }, "Failed to start server");
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down");
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
