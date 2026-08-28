/**
 * Hourly Tournament Scheduler
 *
 * Creates one Tournament instance per active TournamentTier every clock-hour
 * (UTC). Idempotency is enforced at the database level via a unique constraint
 * on TournamentTierScheduleLog(tierId, slotHour) — safe against concurrent
 * processes, retries, and in-process duplicate invocations.
 *
 * Flow:
 *   runTournamentScheduler()  (every 15 s)
 *     → scheduleHourlyTournaments()   (this file)
 *       → for each active TournamentTier:
 *           if TournamentTierScheduleLog[tierId, currentHour] is absent
 *             → create Tournament + log atomically in one transaction
 */

import { prisma } from "@gaming-hub/db";
import type { Prisma } from "@gaming-hub/db";
import { GAME_IDS } from "@gaming-hub/shared";
import type {
  PrizeDistributionEntry,
  TournamentTierCode,
  GameTierAvailability,
  SchedulerPreviewSlot,
  TournamentSchedulerInfo,
} from "@gaming-hub/shared";
import { audit } from "./audit";
import { formatGameName } from "./tournamentEmailService";
import { broadcastAdminAnalytics } from "./socketBridge";
import { TournamentAnalyticsCache } from "./tournamentAnalyticsCache";

// ---------------------------------------------------------------------------
// Scheduler State & Game-Tier Matrix Stores
// ---------------------------------------------------------------------------

let schedulerPaused = false;
const gameTierMatrixStore = new Map<string, Record<string, boolean>>();

export function isHourlySchedulerPaused(): boolean {
  return schedulerPaused;
}

export function setHourlySchedulerPaused(paused: boolean, adminId?: string, reason?: string): void {
  schedulerPaused = paused;
  audit({
    actorType: adminId ? "user" : "system",
    actorId: adminId ?? null,
    action: paused ? "tournament.scheduler.paused" : "tournament.scheduler.resumed",
    category: "game",
    targetType: "system",
    targetId: "hourly-scheduler",
    meta: {
      isPaused: paused,
      reason: reason || (paused ? "Admin paused hourly scheduler" : "Admin resumed hourly scheduler"),
      timestamp: new Date().toISOString(),
    },
  });
  void broadcastAdminAnalytics("admin:analytics:scheduler-status", {
    isPaused: paused,
    status: paused ? "PAUSED" : "RUNNING",
    timestamp: new Date().toISOString(),
  });
  TournamentAnalyticsCache.invalidateScheduler();
  console.log(`[HOURLY_SCHEDULER] Scheduler is now ${paused ? "PAUSED" : "ACTIVE"} (by ${adminId ?? "system"})`);
}

export function getGameTierAvailabilityMatrix(): GameTierAvailability {
  const matrix: GameTierAvailability = {};
  for (const gameId of GAME_IDS) {
    matrix[gameId] = {
      mini: gameTierMatrixStore.get(gameId)?.mini ?? true,
      basic: gameTierMatrixStore.get(gameId)?.basic ?? true,
      standard: gameTierMatrixStore.get(gameId)?.standard ?? true,
      premium: gameTierMatrixStore.get(gameId)?.premium ?? true,
      pro: gameTierMatrixStore.get(gameId)?.pro ?? true,
    };
  }
  return matrix;
}

export function updateGameTierAvailabilityMatrix(
  matrix: GameTierAvailability,
  adminId?: string,
): GameTierAvailability {
  for (const [gameId, tiers] of Object.entries(matrix)) {
    gameTierMatrixStore.set(gameId, tiers);
  }
  audit({
    actorType: adminId ? "user" : "system",
    actorId: adminId ?? null,
    action: "tournament.game_tiers.updated",
    category: "game",
    targetType: "system",
    targetId: "game-tier-matrix",
    meta: { matrix, timestamp: new Date().toISOString() },
  });
  return getGameTierAvailabilityMatrix();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Truncates a Date to the top of its UTC hour.
 * e.g.  2026-08-27T11:47:34Z  →  2026-08-27T11:00:00.000Z
 */
function truncateToHour(d: Date): Date {
  const t = new Date(d);
  t.setUTCMinutes(0, 0, 0);
  return t;
}

/**
 * Returns a valid gameId for the tier taking into account the availability matrix.
 */
function pickGameId(tierId: string, tierCode: string, slotHour: Date): string {
  const allowedGames = GAME_IDS.filter((g) => {
    const tiers = gameTierMatrixStore.get(g);
    if (!tiers) return true;
    return (tiers as any)[tierCode] !== false;
  });

  const pool = allowedGames.length > 0 ? allowedGames : GAME_IDS;
  const seed = `${tierId}:${tierCode}:${slotHour.toISOString()}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) >>> 0;
  }
  return pool[h % pool.length]!;
}

// ---------------------------------------------------------------------------
// Core scheduling function
// ---------------------------------------------------------------------------

export interface HourlyScheduleResult {
  created: number;
  skipped: number;
  errors: string[];
  isPaused?: boolean;
}

/**
 * Main entry-point — called from runTournamentScheduler() every tick.
 *
 * For each active tier, checks whether a tournament already exists for the
 * current clock-hour slot.  If not, creates one atomically.
 */
export async function scheduleHourlyTournaments(): Promise<HourlyScheduleResult> {
  const result: HourlyScheduleResult = { created: 0, skipped: 0, errors: [] };

  if (schedulerPaused) {
    result.isPaused = true;
    return result;
  }

  const now = new Date();
  const currentSlotHour = truncateToHour(now);

  // Tournaments open for registration one hour ahead (i.e., start at the NEXT
  // clock-hour boundary so players have time to join the CURRENT slot).
  const nextSlotHour = new Date(currentSlotHour.getTime() + 60 * 60 * 1000);

  const activeTiers = await prisma.tournamentTier.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  if (activeTiers.length === 0) {
    return result;
  }

  // Create one tournament per (tier × game) per hour → 10 games × 5 tiers = 50 slots/hour
  for (const tier of activeTiers) {
    const allowedGames = GAME_IDS.filter((g) => {
      const tiers = gameTierMatrixStore.get(g);
      if (!tiers) return true;
      return (tiers as any)[tier.code.toLowerCase()] !== false;
    });

    const gamePool = allowedGames.length > 0 ? allowedGames : GAME_IDS;

    for (const gameId of gamePool) {
      try {
        await createTierSlotIfAbsent(tier, gameId, currentSlotHour, nextSlotHour);
        result.created++;
      } catch (err: unknown) {
        // Unique-constraint violation = slot already exists — safe to skip
        if (isUniqueConstraintViolation(err)) {
          result.skipped++;
          continue;
        }
        const msg = `scheduleHourlyTournaments: tier=${tier.code} game=${gameId}: ${String(err)}`;
        console.error(`[HOURLY_SCHEDULER] ${msg}`);
        result.errors.push(msg);
      }
    }
  }

  if (result.created > 0) {
    console.log(
      `[HOURLY_SCHEDULER] slot=${currentSlotHour.toISOString()} created=${result.created} skipped=${result.skipped}`,
    );
  }

  return result;
}

/**
 * Retrieves the current status and metadata of the hourly scheduler.
 */
export async function getHourlySchedulerInfo(): Promise<TournamentSchedulerInfo> {
  const activeTiersCount = await prisma.tournamentTier.count({ where: { isActive: true } });
  const now = new Date();
  const nextRunAt = new Date(truncateToHour(now).getTime() + 60 * 60 * 1000).toISOString();

  return {
    isPaused: schedulerPaused,
    intervalMinutes: 60,
    nextRunAt: schedulerPaused ? null : nextRunAt,
    activeTiersCount,
    enabledGamesCount: GAME_IDS.length,
  };
}

/**
 * Generates preview of upcoming hourly tournament slots across active tiers and games.
 */
export async function getHourlySchedulerPreview(hoursAhead = 6): Promise<SchedulerPreviewSlot[]> {
  const activeTiers = await prisma.tournamentTier.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  const slots: SchedulerPreviewSlot[] = [];
  const currentSlotHour = truncateToHour(new Date());

  for (let i = 1; i <= hoursAhead; i++) {
    const slotHour = new Date(currentSlotHour.getTime() + i * 60 * 60 * 1000);
    const scheduledTime = slotHour.toISOString();

    for (const tier of activeTiers) {
      const tierCode = (tier.code.toLowerCase()) as TournamentTierCode;
      // Show all enabled games for this tier
      const enabledGames = GAME_IDS.filter((g) => {
        const tiers = gameTierMatrixStore.get(g);
        if (!tiers) return true;
        return (tiers as any)[tierCode] !== false;
      });
      const gamePool = enabledGames.length > 0 ? enabledGames : GAME_IDS;

      for (const gameId of gamePool) {
        slots.push({
          scheduledTime,
          gameId,
          gameName: formatGameName(gameId),
          tierCode,
          tierName: tier.name,
          entryFee: tier.entryFee,
          prizePool: tier.prizePool,
          maxPlayers: tier.maxPlayers,
        });
      }
    }
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Atomic slot creation
// ---------------------------------------------------------------------------

type TierRow = Awaited<ReturnType<typeof prisma.tournamentTier.findMany>>[number];

async function createTierSlotIfAbsent(
  tier: TierRow,
  gameId: string,
  currentSlotHour: Date,
  startTime: Date,
): Promise<void> {

  // Prize distribution — read from tier (already stored as JSON array)
  const rawDist = tier.prizeDistribution as unknown as PrizeDistributionEntry[];
  const prizeDistribution: PrizeDistributionEntry[] =
    Array.isArray(rawDist) && rawDist.length > 0
      ? rawDist
      : [
          { rank: 1, percentage: 50 },
          { rank: 2, percentage: 25 },
          { rank: 3, percentage: 15 },
          { rank: 4, percentage: 10 },
        ];

  // Registration closes 5 minutes before the tournament starts
  const registrationEndsAt = new Date(startTime.getTime() - 5 * 60 * 1000);

  const maxEntryCollection = tier.entryFee * tier.maxPlayers;
  const platformShare = Math.max(0, maxEntryCollection - tier.prizePool);
  const calculatedPrizes = prizeDistribution.map((d) => ({
    rank: d.rank,
    percentage: d.percentage ?? 0,
    amount: d.amount != null && d.amount > 0 ? d.amount : Math.floor((tier.prizePool * (d.percentage ?? 0)) / 100),
  }));

  const prizesByRank: Record<number, { percentage: number; amount: number }> = {};
  for (const cp of calculatedPrizes) {
    prizesByRank[cp.rank] = { percentage: cp.percentage, amount: cp.amount };
  }

  const defaultMinByCode: Record<string, number> = {
    mini: 8,
    basic: 16,
    standard: 32,
    premium: 32,
    pro: 64,
  };
  const minPlayers = (tier as any).minPlayers && (tier as any).minPlayers > 0
    ? (tier as any).minPlayers
    : (defaultMinByCode[tier.code.toLowerCase()] ?? 8);

  // configSnapshot: frozen copy of tier config at creation time.
  // Later changes to the tier WILL NOT affect this tournament instance.
  const configSnapshot = {
    tierId: tier.id,
    tierCode: tier.code,
    tierName: tier.name,
    entryFee: tier.entryFee,
    minPlayers,
    maxPlayers: tier.maxPlayers,
    prizePool: tier.prizePool,
    grossPool: tier.prizePool,
    platformShare,
    prizeDistribution,
    calculatedPrizes,
    prizesByRank,
    gameId,
    format: tier.format,
    enableThirdPlace: tier.enableThirdPlace,
    slotHour: currentSlotHour.toISOString(),
    snapshottedAt: new Date().toISOString(),
  };

  const tournamentTitle = `${tier.name} Hourly — ${formatGameName(gameId)} — ${formatSlotLabel(currentSlotHour)}`;

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1. Create the Tournament instance with a frozen snapshot
    const tournament = await tx.tournament.create({
      data: {
        gameId,
        title: tournamentTitle,
        description: tier.description ?? `${tier.name} tier hourly tournament`,
        format: tier.format as any,
        prizePool: tier.prizePool,
        grossPool: tier.prizePool, // gross = prize for hourly tiers (no house cut configured)
        entryFee: tier.entryFee,
        maxPlayers: tier.maxPlayers,
        minPlayers,
        enableThirdPlace: tier.enableThirdPlace,
        autoStartWhenFull: tier.autoStartWhenFull,
        prizeDistribution: prizeDistribution as unknown as Prisma.InputJsonValue,
        configSnapshot: configSnapshot as unknown as Prisma.InputJsonValue,
        status: "REGISTRATION_OPEN",
        startTime: startTime,
        registrationStartsAt: new Date(), // open immediately
        registrationEndsAt,
        createdBy: "system:hourly-scheduler",
      },
      select: { id: true },
    });

    // 2. Record the slot log — unique constraint [tierId, gameId, slotHour] is the
    //    final idempotency guard; if two processes race here, one will throw
    //    a unique-constraint error which we catch outside this fn.
    await tx.tournamentTierScheduleLog.create({
      data: {
        tierId: tier.id,
        gameId,
        tournamentId: tournament.id,
        slotHour: currentSlotHour,
      },
    });

    audit({
      actorType: "system",
      actorId: null,
      action: "tournament.hourly.created",
      category: "game",
      targetType: "tournament",
      targetId: tournament.id,
      meta: {
        tierId: tier.id,
        tierCode: tier.code,
        gameId,
        slotHour: currentSlotHour.toISOString(),
        startTime: startTime.toISOString(),
        prizePool: tier.prizePool,
        entryFee: tier.entryFee,
      },
    });

    void broadcastAdminAnalytics("admin:analytics:tournament-updated", {
      tournamentId: tournament.id,
      status: "REGISTRATION_OPEN",
      gameId,
      tier: tier.code,
      registeredPlayers: 0,
      timestamp: new Date().toISOString(),
    });

    TournamentAnalyticsCache.invalidateTournaments(tournament.id, gameId, tier.code);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSlotLabel(slotHour: Date): string {
  // e.g. "27 Aug 11:00 UTC"
  const day = slotHour.getUTCDate().toString().padStart(2, "0");
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    slotHour.getUTCMonth()
  ]!;
  const hour = slotHour.getUTCHours().toString().padStart(2, "0");
  return `${day} ${month} ${hour}:00 UTC`;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  if (err && typeof err === "object") {
    // Prisma wraps PG unique-constraint errors with code P2002
    const code = (err as Record<string, unknown>).code;
    if (code === "P2002") return true;
    // Also catch native pg error code 23505
    const meta = (err as Record<string, unknown>).meta as Record<string, unknown> | undefined;
    if (meta && typeof meta.target === "string") {
      // Match old [tierId, slotHour] or new [tierId, gameId, slotHour] constraint names
      if (meta.target.includes("slotHour")) return true;
    }
  }
  return false;
}
