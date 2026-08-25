import { buildApp } from "./app";
import { env } from "./env";
import { prisma } from "@gaming-hub/db"; // API Server Entrypoint

const SCHEDULE_INTERVAL_MS = 15 * 60 * 1000;
const TOURNAMENT_SCHEDULER_INTERVAL_MS = 15 * 1000; // 15 seconds for tournament recovery

async function main() {
  const app = buildApp();

  try {
    await prisma.$connect();
    app.log.info("Database connected");

    // Perform crash-safe tournament state recovery & resume immediately on startup
    void import("./services/tournamentRecoveryService")
      .then(({ TournamentRecoveryService }) => TournamentRecoveryService.recoverAllTournamentStates())
      .then((summary) => app.log.info({ summary }, "Tournament crash recovery completed on startup"))
      .catch((err) => app.log.error({ err }, "Tournament crash recovery failed on startup"));
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

  // Scheduled maintenance (tournament statuses, expired coupons, etc.). The
  // automation service guards against overlap, so a slow run is safe.
  const scheduler = setInterval(() => {
    void import("./services/automation")
      .then(({ runScheduledJobs }) => runScheduledJobs())
      .catch((error) => app.log.error({ error }, "scheduled jobs: failed"));
  }, SCHEDULE_INTERVAL_MS);
  void import("./services/automation")
    .then(({ runScheduledJobs }) => runScheduledJobs())
    .catch((error) => app.log.error({ error }, "scheduled jobs: initial run failed"));

  // Tournament scheduler runs more frequently for recovery/reconciliation
  const tournamentScheduler = setInterval(() => {
    void import("./services/automation")
      .then(({ runJob }) => runJob("tournament-scheduler"))
      .catch((error) => {
        if (error?.code === "INVALID_ACTION" && error?.statusCode === 409) return;
        app.log.error({ error }, "tournament scheduler: failed");
      });
  }, TOURNAMENT_SCHEDULER_INTERVAL_MS);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down");
    clearInterval(scheduler);
    clearInterval(tournamentScheduler);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
