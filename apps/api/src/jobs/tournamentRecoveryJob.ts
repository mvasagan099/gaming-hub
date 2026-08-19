import { prisma } from "@gaming-hub/db";
import { TournamentMatchService } from "../services/tournamentMatchService";
import { audit } from "../services/audit";

/**
 * Recovery job for stale tournament matches.
 * Finds tournament slots that should have matches but don't,
 * and detects inconsistent state (matchId exists but Match record missing).
 * 
 * Run periodically (e.g., every 5 minutes) via cron or scheduler.
 */
export async function recoverTournamentMatches(tournamentId?: string): Promise<{
  created: number;
  inconsistencies: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let created = 0;
  let inconsistencies = 0;

  console.log("[TOURNAMENT RECOVERY] Starting recovery job", { tournamentId });

  try {
    // 1. Find slots that are READY with both players but no matchId
    const where: Record<string, unknown> = {
      status: "READY",
      matchId: null,
      playerAId: { not: null },
      playerBId: { not: null },
    };

    if (tournamentId) {
      where.tournamentId = tournamentId;
    }

    const missingMatchSlots = await prisma.tournamentRound.findMany({
      where,
      include: { tournament: true },
    });

    console.log(`[TOURNAMENT RECOVERY] Found ${missingMatchSlots.length} slots missing matches`);

    for (const slot of missingMatchSlots) {
      try {
        const matchId = await TournamentMatchService.ensureTournamentRoundMatch(slot.id);
        if (matchId) {
          created++;
          await TournamentMatchService.notifyMatchCreated(slot, matchId);
          await TournamentMatchService.emitMatchCreatedEvent(slot, matchId);
          console.log(`[TOURNAMENT RECOVERY] Created match ${matchId} for slot ${slot.id}`);
        }
      } catch (error) {
        const errorMsg = `Failed to create match for slot ${slot.id}: ${error}`;
        console.error(`[TOURNAMENT RECOVERY] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // 2. Check for inconsistencies: matchId exists but Match record missing
    const matchIdWhere: Record<string, unknown> = {
      matchId: { not: null },
    };
    if (tournamentId) {
      matchIdWhere.tournamentId = tournamentId;
    }

    const slotsWithMatchId = await prisma.tournamentRound.findMany({
      where: matchIdWhere,
      select: { id: true, matchId: true, tournamentId: true },
    });

    console.log(`[TOURNAMENT RECOVERY] Checking ${slotsWithMatchId.length} slots with matchId for consistency`);

    for (const slot of slotsWithMatchId) {
      if (!slot.matchId) continue;
      const match = await prisma.match.findUnique({ where: { id: slot.matchId } });
      if (!match) {
        inconsistencies++;
        const errorMsg = `INCONSISTENCY: TournamentRound ${slot.id} references missing Match ${slot.matchId}`;
        console.error(`[TOURNAMENT RECOVERY] ${errorMsg}`);
        errors.push(errorMsg);

        // Audit log for admin visibility
        audit({
          actorType: "system",
          actorId: null,
          action: "tournament.match.inconsistency",
          category: "game",
          targetType: "tournament",
          targetId: slot.tournamentId,
          meta: { roundId: slot.id, missingMatchId: slot.matchId },
        });
      }
    }

    // 3. Check for matches that are CREATED but room doesn't exist on socket server
    // (This would require querying the socket server, which is more complex)
    // For now, we log the inconsistency above which will be visible to admins

    console.log(`[TOURNAMENT RECOVERY] Completed: ${created} matches created, ${inconsistencies} inconsistencies found`);
  } catch (error) {
    const errorMsg = `Recovery job failed: ${error}`;
    console.error(`[TOURNAMENT RECOVERY] ${errorMsg}`);
    errors.push(errorMsg);
  }

  return { created, inconsistencies, errors };
}

/**
 * Standalone function to run recovery for all active tournaments.
 * Can be called from a cron job or scheduler.
 */
export async function runTournamentRecoveryJob(): Promise<void> {
  const activeTournaments = await prisma.tournament.findMany({
    where: {
      status: { in: ["IN_PROGRESS", "STARTING"] },
    },
    select: { id: true },
  });

  console.log(`[TOURNAMENT RECOVERY] Running for ${activeTournaments.length} active tournaments`);

  for (const t of activeTournaments) {
    await recoverTournamentMatches(t.id);
  }
}

// If run directly via CLI
if (require.main === module) {
  runTournamentRecoveryJob()
    .then(() => {
      console.log("[TOURNAMENT RECOVERY] Job completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("[TOURNAMENT RECOVERY] Job failed:", error);
      process.exit(1);
    });
}