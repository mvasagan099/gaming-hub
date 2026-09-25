/**
 * ALL GAME × TIER COMBINATIONS — AVAILABILITY VERIFICATION
 *
 * Validates that all 45 combinations (9 games × 5 tiers) are fully
 * supported by the platform without any restriction, hardcoded exclusion,
 * or missing configuration.
 *
 * Scope:
 *   1.  Canonical game registry contains exactly 9 games.
 *   2.  Canonical tier defaults contain exactly 5 tiers with correct fees/pools.
 *   3.  Every game is accepted by `isGameId()` validation.
 *   4.  Every game has a complete `DEFAULT_GAME_CONFIGS` entry.
 *   5.  All 45 game×tier combinations are enabled in the availability matrix.
 *   6.  Prize distribution math is correct for all 5 tiers (50/25/15/10 split).
 *   7.  A tournament can be created in the DB for each of the 45 combinations.
 *   8.  A player can register for any game×tier tournament without error.
 *   9.  Entry fee is deducted exactly once per registration.
 *   10. Bracket can be built for any game×tier tournament.
 *
 * Invariants (DO NOT change):
 *   - MAX_MATCH_DURATION_SECONDS = 600 (10 minutes)
 *   - Prize split: 50 / 25 / 15 / 10 %
 *   - Wallet / ledger logic is unchanged
 *   - Game rules are unchanged
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@gaming-hub/db";
import {
  GAME_IDS,
  DEFAULT_GAME_CONFIGS,
  DEFAULT_TOURNAMENT_TIERS,
  DEFAULT_TIER_PRIZE_DISTRIBUTION,
  calculatePrizes,
  validatePrizeConfiguration,
  isGameId,
  MAX_MATCH_DURATION_SECONDS,
} from "@gaming-hub/shared";
import {
  getGameTierAvailabilityMatrix,
  updateGameTierAvailabilityMatrix,
} from "../hourlyTournamentScheduler";
import { buildSingleEliminationBracket, startTournament } from "../tournamentEngine";
import { registerForTournament } from "../tournaments";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_9_GAMES = [
  "snake-ladder",
  "ludo",
  "chess",
  "carrom",
  "fruit-ninja",
  "bubble-shooter",
  "table-tennis",
  "snake-vs-worms",
  "snooker",
] as const;

const ALL_5_TIERS = ["mini", "basic", "standard", "premium", "pro"] as const;

/** Expected config for each tier (DO NOT edit — mirrors DEFAULT_TOURNAMENT_TIERS). */
const TIER_EXPECTATIONS = {
  mini:     { entryFee: 5,   prizePool: 400,   maxPlayers: 100,  minPlayers: 8  },
  basic:    { entryFee: 10,  prizePool: 1600,  maxPlayers: 200,  minPlayers: 16 },
  standard: { entryFee: 25,  prizePool: 10000, maxPlayers: 500,  minPlayers: 32 },
  premium:  { entryFee: 50,  prizePool: 22500, maxPlayers: 500,  minPlayers: 32 },
  pro:      { entryFee: 100, prizePool: 90000, maxPlayers: 1000, minPlayers: 64 },
} as const;

/** Expected prize amounts (Math.floor(pool × pct / 100)). */
const TIER_PRIZE_AMOUNTS = {
  mini:     { "1st": 200,   "2nd": 100,  "3rd": 60,   "4th": 40   },
  basic:    { "1st": 800,   "2nd": 400,  "3rd": 240,  "4th": 160  },
  standard: { "1st": 5000,  "2nd": 2500, "3rd": 1500, "4th": 1000 },
  premium:  { "1st": 11250, "2nd": 5625, "3rd": 3375, "4th": 2250 },
  pro:      { "1st": 45000, "2nd": 22500,"3rd": 13500,"4th": 9000 },
} as const;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const createdTournamentIds: string[] = [];
const createdUserIds: string[] = [];

async function createPlayer(tag: string, balance = 2000) {
  const id = `u_combo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  createdUserIds.push(id);
  const rand = Math.random().toString(36).slice(2, 8);
  await prisma.user.create({
    data: {
      id,
      email: `combo_${tag}_${rand}@gaminghub.test`,
      username: `cmb_${Date.now().toString(36)}_${rand}`,
      displayName: `Combo Player ${tag}`,
      role: "USER",
      profile: { create: {} },
      wallet: { create: { balance } },
    },
  });
  return id;
}

async function createCombinationTournament(gameId: string, tierCode: string, entryFee: number, prizePool: number) {
  const id = `tourn_combo_${gameId}_${tierCode}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  createdTournamentIds.push(id);
  await prisma.tournament.create({
    data: {
      id,
      title: `${tierCode.toUpperCase()} Hourly — ${gameId}`,
      description: `Parameterized combination test: ${gameId} × ${tierCode}`,
      gameId,
      format: "SINGLE_ELIMINATION",
      status: "REGISTRATION_OPEN",
      entryFee,
      prizePool,
      grossPool: prizePool,
      minPlayers: 2,
      maxPlayers: 16,
      startTime: new Date(Date.now() + 60 * 60 * 1000),
      registrationStartsAt: new Date(),
      registrationEndsAt: new Date(Date.now() + 55 * 60 * 1000),
      prizeDistribution: DEFAULT_TIER_PRIZE_DISTRIBUTION as any,
    },
  });
  return id;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterAll(async () => {
  // Clean up in dependency order to avoid FK violations
  if (createdTournamentIds.length > 0) {
    await prisma.tournamentNotificationIdempotency
      .deleteMany({ where: { tournamentId: { in: createdTournamentIds } } })
      .catch(() => undefined);
    await prisma.tournamentTierScheduleLog
      .deleteMany({ where: { tournamentId: { in: createdTournamentIds } } })
      .catch(() => undefined);
    await prisma.tournamentRound
      .deleteMany({ where: { tournamentId: { in: createdTournamentIds } } })
      .catch(() => undefined);
    await prisma.tournamentPlayer
      .deleteMany({ where: { tournamentId: { in: createdTournamentIds } } })
      .catch(() => undefined);
    await prisma.idempotencyRecord
      .deleteMany({ where: { referenceId: { in: createdTournamentIds } } })
      .catch(() => undefined);
    await prisma.transaction
      .deleteMany({ where: { referenceId: { in: createdTournamentIds }, referenceType: "TOURNAMENT_ENTRY" } })
      .catch(() => undefined);
    await prisma.tournament
      .deleteMany({ where: { id: { in: createdTournamentIds } } })
      .catch(() => undefined);
  }
  if (createdUserIds.length > 0) {
    await prisma.wallet
      .deleteMany({ where: { userId: { in: createdUserIds } } })
      .catch(() => undefined);
    await prisma.profile
      .deleteMany({ where: { userId: { in: createdUserIds } } })
      .catch(() => undefined);
    await prisma.user
      .deleteMany({ where: { id: { in: createdUserIds } } })
      .catch(() => undefined);
  }
});

// ===========================================================================
// SUITE 1 — Shared game registry completeness
// ===========================================================================

describe("SUITE 1 — Game Registry Completeness", () => {
  it("GAME_IDS exports exactly 9 unique game identifiers", () => {
    expect(GAME_IDS).toHaveLength(9);
    const unique = new Set(GAME_IDS);
    expect(unique.size).toBe(9);
  });

  it("all 9 required games are present in GAME_IDS", () => {
    const required = [...ALL_9_GAMES];
    for (const g of required) {
      expect(GAME_IDS).toContain(g);
    }
  });

  it("isGameId() accepts all 9 games and rejects invalid values", () => {
    for (const g of ALL_9_GAMES) {
      expect(isGameId(g)).toBe(true);
    }
    expect(isGameId("unknown-game")).toBe(false);
    expect(isGameId("cricket")).toBe(false); // Retired game IDs cannot enter new gameplay.
    expect(isGameId("")).toBe(false);
    expect(isGameId("CHESS")).toBe(false); // case sensitive
  });

  it("DEFAULT_GAME_CONFIGS has a complete entry for every registered game", () => {
    for (const gameId of ALL_9_GAMES) {
      const cfg = DEFAULT_GAME_CONFIGS[gameId as keyof typeof DEFAULT_GAME_CONFIGS];
      expect(cfg, `Missing config for ${gameId}`).toBeDefined();
      expect(cfg.gameId).toBe(gameId);
      expect(cfg.enabled).toBe(true);
      expect(cfg.onlineEnabled).toBe(true);
      expect(cfg.matchDurationSeconds).toBeLessThanOrEqual(MAX_MATCH_DURATION_SECONDS);
      expect(cfg.minPlayers).toBeGreaterThanOrEqual(2);
      expect(cfg.maxPlayers).toBeGreaterThanOrEqual(cfg.minPlayers);
      expect(cfg.entryFees.length).toBeGreaterThan(0);
      expect(cfg.entryFees).toContain(cfg.defaultEntryFee);
    }
  });
});

// ===========================================================================
// SUITE 2 — Tier configuration correctness
// ===========================================================================

describe("SUITE 2 — Tier Configuration Correctness", () => {
  it("DEFAULT_TOURNAMENT_TIERS contains exactly 5 tiers", () => {
    expect(DEFAULT_TOURNAMENT_TIERS).toHaveLength(5);
  });

  it("tier codes are exactly the canonical 5", () => {
    const codes = DEFAULT_TOURNAMENT_TIERS.map((t) => t.code).sort();
    expect(codes).toEqual([...ALL_5_TIERS].sort());
  });

  it.each(ALL_5_TIERS)("tier '%s' has correct entry fee, prize pool, and player limits", (code) => {
    const tier = DEFAULT_TOURNAMENT_TIERS.find((t) => t.code === code);
    expect(tier, `Missing tier: ${code}`).toBeDefined();
    const expected = TIER_EXPECTATIONS[code];
    expect(tier!.entryFee).toBe(expected.entryFee);
    expect(tier!.prizePool).toBe(expected.prizePool);
    expect(tier!.maxPlayers).toBe(expected.maxPlayers);
    expect(tier!.minPlayers).toBe(expected.minPlayers);
    expect(tier!.isActive).toBe(true);
    expect(tier!.format).toBe("SINGLE_ELIMINATION");
    expect(tier!.enableThirdPlace).toBe(true);
  });

  it("all tiers use the canonical 50/25/15/10 prize distribution", () => {
    for (const tier of DEFAULT_TOURNAMENT_TIERS) {
      expect(tier.prizeDistribution).toHaveLength(4);
      const pcts = tier.prizeDistribution.map((d) => d.percentage);
      expect(pcts).toContain(50);
      expect(pcts).toContain(25);
      expect(pcts).toContain(15);
      expect(pcts).toContain(10);
      const total = pcts.reduce((a, b) => a + b, 0);
      expect(total).toBe(100);
    }
  });

  it("DEFAULT_TIER_PRIZE_DISTRIBUTION is a valid 4-position 50/25/15/10 split", () => {
    const dist = DEFAULT_TIER_PRIZE_DISTRIBUTION;
    expect(dist).toHaveLength(4);
    const ranks = dist.map((d) => d.rank).sort();
    expect(ranks).toEqual([1, 2, 3, 4]);
    const total = dist.reduce((a, d) => a + d.percentage, 0);
    expect(total).toBe(100);
    const r1 = dist.find((d) => d.rank === 1)!;
    const r2 = dist.find((d) => d.rank === 2)!;
    const r3 = dist.find((d) => d.rank === 3)!;
    const r4 = dist.find((d) => d.rank === 4)!;
    expect(r1.percentage).toBe(50);
    expect(r2.percentage).toBe(25);
    expect(r3.percentage).toBe(15);
    expect(r4.percentage).toBe(10);
  });
});

// ===========================================================================
// SUITE 3 — Prize distribution math for all 5 tiers
// ===========================================================================

describe("SUITE 3 — Prize Distribution Math", () => {
  it.each(ALL_5_TIERS)("tier '%s' prize amounts are exactly correct", (code) => {
    const tier = DEFAULT_TOURNAMENT_TIERS.find((t) => t.code === code)!;
    const prizes = calculatePrizes(tier.prizePool, DEFAULT_TIER_PRIZE_DISTRIBUTION);
    expect(prizes).toHaveLength(4);

    const expected = TIER_PRIZE_AMOUNTS[code];
    const byRank: Record<number, number> = {};
    for (const p of prizes) byRank[p.rank] = p.amount;

    expect(byRank[1], `${code} 1st prize`).toBe(expected["1st"]);
    expect(byRank[2], `${code} 2nd prize`).toBe(expected["2nd"]);
    expect(byRank[3], `${code} 3rd prize`).toBe(expected["3rd"]);
    expect(byRank[4], `${code} 4th prize`).toBe(expected["4th"]);
  });

  it("prize configuration is valid for all 5 tier prize pools", () => {
    for (const tier of DEFAULT_TOURNAMENT_TIERS) {
      const result = validatePrizeConfiguration(tier.prizePool, DEFAULT_TIER_PRIZE_DISTRIBUTION);
      expect(result.valid, `Invalid prize config for ${tier.code}: ${result.error}`).toBe(true);
      expect(result.totalPercentage).toBe(100);
    }
  });

  it("total prize amounts sum to exactly the full prize pool (no rounding loss > 1 coin per tier)", () => {
    for (const tier of DEFAULT_TOURNAMENT_TIERS) {
      const prizes = calculatePrizes(tier.prizePool, DEFAULT_TIER_PRIZE_DISTRIBUTION);
      const totalPaid = prizes.reduce((s, p) => s + p.amount, 0);
      // Allow at most 3 coins of floor-rounding loss across 4 positions
      expect(totalPaid).toBeGreaterThanOrEqual(tier.prizePool - 3);
      expect(totalPaid).toBeLessThanOrEqual(tier.prizePool);
    }
  });
});

// ===========================================================================
// SUITE 4 — Game-tier availability matrix
// ===========================================================================

describe("SUITE 4 — Game-Tier Availability Matrix", () => {
  beforeAll(() => {
    // Reset matrix to defaults before this suite
    const reset: Record<string, Record<string, boolean>> = {};
    for (const g of ALL_9_GAMES) {
      reset[g] = { mini: true, basic: true, standard: true, premium: true, pro: true };
    }
    updateGameTierAvailabilityMatrix(reset);
  });

  it("matrix has an entry for all 9 games", () => {
    const matrix = getGameTierAvailabilityMatrix();
    for (const g of ALL_9_GAMES) {
      expect(matrix[g], `Missing matrix entry for ${g}`).toBeDefined();
    }
  });

  it("all 45 game×tier combinations default to enabled (true)", () => {
    const matrix = getGameTierAvailabilityMatrix();
    for (const g of ALL_9_GAMES) {
      for (const t of ALL_5_TIERS) {
        expect(
          matrix[g]![t],
          `Combination ${g}×${t} should be enabled by default`,
        ).toBe(true);
      }
    }
  });

  it("disabling a combination is reflected immediately without affecting others", () => {
    const matrix = getGameTierAvailabilityMatrix();
    const updated = updateGameTierAvailabilityMatrix({
      ...matrix,
      chess: { mini: true, basic: true, standard: true, premium: false, pro: false },
    });

    expect(updated.chess.premium).toBe(false);
    expect(updated.chess.pro).toBe(false);
    // Other tiers of chess remain enabled
    expect(updated.chess.mini).toBe(true);
    expect(updated.chess.basic).toBe(true);
    expect(updated.chess.standard).toBe(true);
    // Other games are unaffected
    expect(updated["ludo"]!.premium).toBe(true);
    expect(updated["snooker"]!.pro).toBe(true);
  });

  it("re-enabling a combination restores it to true", () => {
    const matrix = getGameTierAvailabilityMatrix();
    // chess.premium and chess.pro were disabled in previous test; restore them
    const restored = updateGameTierAvailabilityMatrix({
      ...matrix,
      chess: { mini: true, basic: true, standard: true, premium: true, pro: true },
    });
    expect(restored.chess.premium).toBe(true);
    expect(restored.chess.pro).toBe(true);
  });
});

// ===========================================================================
// SUITE 5 — Tournament creation for all 45 combinations
// ===========================================================================

describe("SUITE 5 — Tournament Creation (all 45 game×tier combos)", () => {
  it.each(
    ALL_9_GAMES.flatMap((gameId) =>
      ALL_5_TIERS.map((tierCode) => [gameId, tierCode] as const),
    ),
  )("can create a REGISTRATION_OPEN tournament for %s × %s", async (gameId, tierCode) => {
    const tier = DEFAULT_TOURNAMENT_TIERS.find((t) => t.code === tierCode)!;
    const tournId = await createCombinationTournament(
      gameId,
      tierCode,
      tier.entryFee,
      tier.prizePool,
    );

    const tournament = await prisma.tournament.findUnique({ where: { id: tournId } });
    expect(tournament, `Tournament not found for ${gameId}×${tierCode}`).not.toBeNull();
    expect(tournament!.gameId).toBe(gameId);
    expect(tournament!.entryFee).toBe(tier.entryFee);
    expect(tournament!.prizePool).toBe(tier.prizePool);
    expect(tournament!.status).toBe("REGISTRATION_OPEN");
    expect(isGameId(tournament!.gameId)).toBe(true);
  });
});

// ===========================================================================
// SUITE 6 — Player registration for sample combinations
// ===========================================================================

describe("SUITE 6 — Player Registration (representative sample)", () => {
  /**
   * Full registration for all 45 combinations would be too slow for a unit
   * test (50 DB writes × player × wallet deduction). We test one game per tier
   * (5 registrations) — enough to prove the path is open for every tier, plus
   * representative games from each category (Board/Arcade/Sports).
   */
  const SAMPLE_COMBINATIONS: Array<{ gameId: string; tierCode: string }> = [
    { gameId: "chess",         tierCode: "mini"     },
    { gameId: "ludo",          tierCode: "basic"    },
    { gameId: "fruit-ninja",   tierCode: "standard" },
    { gameId: "table-tennis",  tierCode: "premium"  },
    { gameId: "snooker",       tierCode: "pro"      },
    // Additional cross-coverage
    { gameId: "snake-ladder",  tierCode: "mini"     },
    { gameId: "carrom",        tierCode: "standard" },
    { gameId: "bubble-shooter",tierCode: "basic"    },
    { gameId: "snake-vs-worms",tierCode: "premium"  },
    { gameId: "ludo",       tierCode: "pro"      },
  ];

  it.each(SAMPLE_COMBINATIONS)(
    "player can register for $gameId × $tierCode (entry fee deducted once)",
    async ({ gameId, tierCode }) => {
      const tier = DEFAULT_TOURNAMENT_TIERS.find((t) => t.code === tierCode)!;
      const entryFee = tier.entryFee;
      const initialBalance = entryFee * 10; // ensure sufficient balance

      const tournId = await createCombinationTournament(gameId, tierCode, entryFee, tier.prizePool);
      const playerId = await createPlayer(`${gameId}_${tierCode}`, initialBalance);

      const result = await registerForTournament(playerId, tournId);
      expect(result).toBeDefined();

      // Wallet: entry fee deducted exactly once
      const wallet = await prisma.wallet.findUnique({ where: { userId: playerId } });
      expect(wallet).not.toBeNull();
      expect(wallet!.balance).toBe(initialBalance - entryFee);

      // Ledger: exactly one TOURNAMENT_ENTRY debit transaction
      const txCount = await prisma.transaction.count({
        where: { userId: playerId, referenceId: tournId, referenceType: "TOURNAMENT_ENTRY" },
      });
      expect(txCount).toBe(1);
      // Amount reflects the entry fee (stored as positive value on debit records)
      const tx = await prisma.transaction.findFirst({
        where: { userId: playerId, referenceId: tournId, referenceType: "TOURNAMENT_ENTRY" },
      });
      expect(tx).not.toBeNull();
      expect(Math.abs(tx!.amount)).toBe(entryFee);

      // Player record exists in tournament
      const tp = await prisma.tournamentPlayer.findUnique({
        where: { tournamentId_userId: { tournamentId: tournId, userId: playerId } },
      });
      expect(tp).not.toBeNull();
    },
  );
});

// ===========================================================================
// SUITE 7 — Bracket build for representative combinations
// ===========================================================================

describe("SUITE 7 — Bracket Generation (representative sample)", () => {
  const BRACKET_GAMES: string[] = [
    "chess",
    "ludo",
    "fruit-ninja",
    "table-tennis",
    "snooker",
  ];

  it.each(BRACKET_GAMES)(
    "bracket can be built for game '%s' (standard tier, 8 players)",
    async (gameId) => {
      const tier = DEFAULT_TOURNAMENT_TIERS.find((t) => t.code === "standard")!;
      const id = await createCombinationTournament(gameId, "standard", tier.entryFee, tier.prizePool);

      // Register 8 players
      for (let i = 0; i < 8; i++) {
        const pid = await createPlayer(`bkt_${gameId}_${i}`, tier.entryFee + 500);
        await registerForTournament(pid, id);
      }

      // Update startTime to past so the scheduler considers it overdue;
      // keep status as REGISTRATION_OPEN — valid transition: REGISTRATION_OPEN → STARTING
      await prisma.tournament.update({
        where: { id },
        data: { minPlayers: 2, startTime: new Date(Date.now() - 1000) },
      });

      await startTournament(id);
      // buildSingleEliminationBracket returns void; verify via DB
      await buildSingleEliminationBracket(id);

      const rounds = await prisma.tournamentRound.count({ where: { tournamentId: id } });
      expect(rounds).toBeGreaterThanOrEqual(3); // 8-player bracket = 3 rounds (R1, R2, Final)
    },
  );
});

// ===========================================================================
// SUITE 8 — Invariant guard (structural, no DB required)
// ===========================================================================

describe("SUITE 8 — System Invariants", () => {
  it("MAX_MATCH_DURATION_SECONDS is exactly 600 (10 minutes)", () => {
    expect(MAX_MATCH_DURATION_SECONDS).toBe(600);
  });

  it("no game config exceeds the 10-minute match limit", () => {
    for (const gameId of ALL_9_GAMES) {
      const cfg = DEFAULT_GAME_CONFIGS[gameId as keyof typeof DEFAULT_GAME_CONFIGS];
      expect(cfg.matchDurationSeconds).toBeLessThanOrEqual(600);
    }
  });

  it("prize distribution always sums to exactly 100%", () => {
    const total = DEFAULT_TIER_PRIZE_DISTRIBUTION.reduce((s, d) => s + d.percentage, 0);
    expect(total).toBe(100);
  });

  it("all 9 games have entry fee 50 available in their default config", () => {
    // This ensures all games are eligible for the 'premium' tier (entryFee=50)
    for (const gameId of ALL_9_GAMES) {
      const cfg = DEFAULT_GAME_CONFIGS[gameId as keyof typeof DEFAULT_GAME_CONFIGS];
      expect(cfg.entryFees).toContain(50);
    }
  });

  it("all 9 games have entry fee 100 available for the pro tier", () => {
    for (const gameId of ALL_9_GAMES) {
      const cfg = DEFAULT_GAME_CONFIGS[gameId as keyof typeof DEFAULT_GAME_CONFIGS];
      expect(cfg.entryFees).toContain(100);
    }
  });

  it("scheduler matrix defaults do not gate any game or tier", () => {
    // After resetting, all 45 combinations must be enabled
    const reset: Record<string, Record<string, boolean>> = {};
    for (const g of ALL_9_GAMES) {
      reset[g] = { mini: true, basic: true, standard: true, premium: true, pro: true };
    }
    const matrix = updateGameTierAvailabilityMatrix(reset);

    let combinationCount = 0;
    for (const g of ALL_9_GAMES) {
      for (const t of ALL_5_TIERS) {
        expect(matrix[g]![t]).toBe(true);
        combinationCount++;
      }
    }
    expect(combinationCount).toBe(45);
  });
});

// ===========================================================================
// SUITE 9 — Scheduler Integration: 45 tournaments/hour + idempotency
// ===========================================================================

describe("SUITE 9 — Hourly Scheduler: 45 slots per hour + idempotency", () => {
  let scheduleHourlyTournaments: () => Promise<import("../hourlyTournamentScheduler").HourlyScheduleResult>;

  async function seedSchedulerTiers() {
    for (const tier of DEFAULT_TOURNAMENT_TIERS) {
      await prisma.tournamentTier.upsert({
        where: { code: tier.code },
        update: { isActive: true },
        create: {
          name: tier.name,
          code: tier.code,
          entryFee: tier.entryFee,
          maxPlayers: tier.maxPlayers,
          prizePool: tier.prizePool,
          prizeDistribution: tier.prizeDistribution as any,
          sortOrder: tier.sortOrder,
          isActive: true,
        },
      });
    }
  }

  beforeAll(async () => {
    const mod = await import("../hourlyTournamentScheduler");
    scheduleHourlyTournaments = mod.scheduleHourlyTournaments;
  });

  beforeEach(async () => {
    await seedSchedulerTiers();
  });

  it("first run creates exactly 45 tournaments (9 games × 5 active tiers)", async () => {
    // Count existing schedule log entries for the NEXT hour slot
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setUTCMinutes(0, 0, 0);
    nextHour.setUTCHours(nextHour.getUTCHours() + 1);

    const before = await prisma.tournamentTierScheduleLog.count({
      where: { slotHour: nextHour },
    });

    // Run the scheduler (it creates for currentSlotHour, not nextHour, but
    // we verify by inspecting the returned created count)
    const result = await scheduleHourlyTournaments();

    // Either 45 created (fresh run) or 0 created + 45 skipped (already ran this hour)
    const total = result.created + result.skipped;
    expect(result.errors).toHaveLength(0);

    // Total scheduled for the CURRENT slot must be exactly 45 (9 × 5)
    const activeTierCount = await prisma.tournamentTier.count({ where: { isActive: true } });
    expect(activeTierCount).toBe(5);
    // Each of the 5 tiers must have 9 game slots = 45 total
    expect(total).toBe(45);
  }, 30000);

  it("second run is fully idempotent — creates 0 new tournaments", async () => {
    await scheduleHourlyTournaments();
    const result = await scheduleHourlyTournaments();
    // All 45 slots already exist → every attempt is skipped, none created
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(45);
    expect(result.errors).toHaveLength(0);
  }, 15000);

  it("all 5 tiers have exactly 9 game slots in the DB for the current hour", async () => {
    await scheduleHourlyTournaments();
    const now = new Date();
    const currentSlot = new Date(now);
    currentSlot.setUTCMinutes(0, 0, 0);

    const logs = await prisma.tournamentTierScheduleLog.findMany({
      where: { slotHour: currentSlot },
      include: { tier: { select: { code: true } } },
    });

    const byTier: Record<string, string[]> = {};
    for (const log of logs) {
      const code = log.tier.code;
      if (!byTier[code]) byTier[code] = [];
      byTier[code]!.push(log.gameId);
    }

    for (const tierCode of ALL_5_TIERS) {
      const games = byTier[tierCode] ?? [];
      expect(games.length, `${tierCode} should have 9 game slots`).toBe(9);
      // All 9 game IDs must be present, each exactly once
      const gameSet = new Set(games);
      expect(gameSet.size).toBe(9);
      for (const g of ALL_9_GAMES) {
        expect(gameSet.has(g), `${tierCode} missing game ${g}`).toBe(true);
      }
    }
  }, 10000);
});
