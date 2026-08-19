import { prisma } from "@gaming-hub/db";
import type { Prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { env } from "../env";
import { notifyUserSocket } from "./socketBridge";
import { audit } from "./audit";
import { TournamentNotificationService } from "./tournamentNotificationService";

export interface TournamentMatchMetadata {
  tournamentId: string;
  tournamentRoundId: string;
  tournamentMatchNumber: number;
  tournamentEntryHandled: true;
}

export interface CurrentMatchResponse {
  tournamentId: string;
  roundId: string;
  matchId: string;
  opponent: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
  status: "READY" | "IN_PROGRESS" | "COMPLETED" | "WAITING";
  roundNumber: number;
  matchNumber: number;
}

/**
 * TournamentMatchService
 * Handles automatic match orchestration for tournament brackets.
 * - Idempotent match creation
 * - BYE chain handling
 * - Player notifications
 * - WebSocket events
 * - Recovery job
 */
export class TournamentMatchService {
  /**
   * Ensure a match exists for a tournament round slot.
   * Idempotent: returns existing matchId if already created.
   * Only creates match when both players are assigned and slot is READY.
   */
  static async ensureTournamentRoundMatch(roundId: string): Promise<string | null> {
    // First check if slot already has a match (fast path)
    const slot = await prisma.tournamentRound.findUnique({
      where: { id: roundId },
      include: { tournament: true },
    });

    if (!slot) {
      throw new AppError("NOT_FOUND", "Tournament round slot not found", 404);
    }

    // Skip if completed, BYE, or cancelled
    if (slot.status === "COMPLETED" || slot.status === "BYE" || slot.status === "CANCELLED") {
      return null;
    }

    // Return existing match if already created
    if (slot.matchId) {
      return slot.matchId;
    }

    // Need both players to create a match
    if (!slot.playerAId || !slot.playerBId) {
      return null;
    }

    // Call socket server to create tournament match room with metadata
    const matchId = await this.createTournamentMatchOnSocketServer({
      id: slot.id,
      tournamentId: slot.tournamentId,
      tournament: { gameId: slot.tournament.gameId },
      playerAId: slot.playerAId!,
      playerBId: slot.playerBId!,
      roundNumber: slot.roundNumber,
      matchNumber: slot.matchNumber,
    });
    if (!matchId) {
      throw new AppError("INTERNAL_ERROR", "Failed to create tournament match on socket server", 500);
    }

    // Update the tournament round with matchId and status
    await prisma.tournamentRound.update({
      where: { id: roundId },
      data: { matchId, status: "IN_PROGRESS" },
    });

    // Increment tournament stateVersion for bracket updates
    await prisma.tournament.update({
      where: { id: slot.tournamentId },
      data: { stateVersion: { increment: 1 } },
    });

    return matchId;
  }

  /**
   * Create tournament match on socket server via internal API
   */
  private static async createTournamentMatchOnSocketServer(slot: {
    id: string;
    tournamentId: string;
    tournament: { gameId: string };
    playerAId: string;
    playerBId: string;
    roundNumber: number;
    matchNumber: number;
  }): Promise<string | null> {
    const socketServerUrl = process.env.SOCKET_SERVER_URL ?? "http://localhost:4001";
    const internalKey = env.INTERNAL_API_KEY;

    try {
      const response = await fetch(`${socketServerUrl}/internal/tournament/create-match`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-key": internalKey,
        },
        body: JSON.stringify({
          playerIds: [slot.playerAId, slot.playerBId],
          gameId: slot.tournament.gameId,
          tournamentId: slot.tournamentId,
          tournamentRoundId: slot.id,
          tournamentMatchNumber: slot.matchNumber,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const result = await response.json() as { ok: boolean; matchId?: string; error?: string };

      if (!result.ok) {
        console.error(`[TOURNAMENT] Socket server match creation failed:`, result.error);
        return null;
      }

      return result.matchId ?? null;
    } catch (error) {
      console.error(`[TOURNAMENT] Socket server match creation error:`, error);
      return null;
    }
  }

  /**
   * Create a tournament match with full metadata.
   * Used internally by ensureTournamentRoundMatch.
   */
  static async createTournamentMatch(roundId: string): Promise<string> {
    const matchId = await this.ensureTournamentRoundMatch(roundId);
    if (!matchId) {
      throw new AppError("INVALID_ACTION", "Slot is not ready for a match", 400);
    }
    return matchId;
  }

  /**
   * Create all immediately playable matches for a tournament (Round 1).
   * Called from startTournament() after bracket is built.
   */
  static async createReadyMatchesForTournament(tournamentId: string): Promise<string[]> {
    const readySlots = await prisma.tournamentRound.findMany({
      where: {
        tournamentId,
        status: "READY",
        matchId: null,
      },
      include: {
        tournament: true,
      },
    });

    const createdMatchIds: string[] = [];

    for (const slot of readySlots) {
      if (slot.playerAId && slot.playerBId) {
        try {
          const matchId = await this.ensureTournamentRoundMatch(slot.id);
          if (matchId) {
            createdMatchIds.push(matchId);

            // Notify players
            await this.notifyMatchCreated(slot, matchId);

            // Emit WebSocket event
            await this.emitMatchCreatedEvent(slot, matchId);
          }
        } catch (error) {
          // Log but don't fail the entire tournament start
          console.error(`[TOURNAMENT] Failed to create match for slot ${slot.id}:`, error);
        }
      }
    }

    return createdMatchIds;
  }

  /**
   * Advance winner and create next match if both players are ready.
   * Called from processMatchResult after advancing winner to next slot.
   */
  static async advanceAndCreateNextMatch(
    tournamentId: string,
    winnerId: string,
    completedRoundId: string
  ): Promise<void> {
    const completedSlot = await prisma.tournamentRound.findUnique({
      where: { id: completedRoundId },
    });

    if (!completedSlot?.nextSlotId) return;

    const nextSlot = await prisma.tournamentRound.findUnique({
      where: { id: completedSlot.nextSlotId },
      include: { tournament: true },
    });

    if (!nextSlot) return;

    // If next slot now has both players and is READY, create the match
    if (nextSlot.playerAId && nextSlot.playerBId && nextSlot.status === "READY" && !nextSlot.matchId) {
      try {
        const matchId = await this.ensureTournamentRoundMatch(nextSlot.id);
        if (matchId) {
          await this.notifyMatchCreated(nextSlot, matchId);
          await this.emitMatchCreatedEvent(nextSlot, matchId);
        }
      } catch (error) {
        console.error(`[TOURNAMENT] Failed to create next match for slot ${nextSlot.id}:`, error);
      }
    }
  }

  /**
   * Notify both players that their tournament match is ready.
   */
  static async notifyMatchCreated(slot: { id: string; tournamentId: string; playerAId: string | null; playerBId: string | null; roundNumber: number; matchNumber: number }, matchId: string): Promise<void> {
    if (!slot.playerAId || !slot.playerBId) return;

    const tournament = await prisma.tournament.findUnique({
      where: { id: slot.tournamentId },
      select: { title: true, gameId: true },
    });
    if (!tournament) return;

    const totalRoundsAgg = await prisma.tournamentRound.aggregate({
      where: { tournamentId: slot.tournamentId },
      _max: { roundNumber: true },
    });
    const totalRounds = totalRoundsAgg._max.roundNumber ?? 1;

    await TournamentNotificationService.notifyMatchReady({
      tournamentId: slot.tournamentId,
      tournamentTitle: tournament.title,
      roundId: slot.id,
      matchId,
      roundNumber: slot.roundNumber,
      totalRounds,
      gameId: tournament.gameId,
      playerAId: slot.playerAId,
      playerBId: slot.playerBId,
    });
  }

  /**
   * Emit WebSocket event for match creation.
   */
  static async emitMatchCreatedEvent(slot: { tournamentId: string; id: string; playerAId: string | null; playerBId: string | null; roundNumber: number }, matchId: string): Promise<void> {
    const payload = {
      tournamentId: slot.tournamentId,
      roundId: slot.id,
      matchId,
      playerAId: slot.playerAId!,
      playerBId: slot.playerBId!,
      roundNumber: slot.roundNumber,
    };

    // Emit to both players' personal rooms
    await Promise.all([
      notifyUserSocket(slot.playerAId!, "tournament:match-created", payload),
      notifyUserSocket(slot.playerBId!, "tournament:match-created", payload),
    ]);

    // Broadcast bracket update to all tournament participants
    await this.broadcastTournamentUpdated(slot.tournamentId);
  }

  /**
   * Broadcast tournament:updated event to all tournament participants
   */
  private static async broadcastTournamentUpdated(tournamentId: string): Promise<void> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { stateVersion: true, players: { select: { userId: true } } },
    });

    if (!tournament) return;

    const payload = {
      tournamentId,
      stateVersion: tournament.stateVersion,
    };

    // Emit to all tournament participants
    await Promise.all(
      tournament.players.map((p) =>
        notifyUserSocket(p.userId, "tournament:updated", payload)
      )
    );
  }

  /**
   * Get current active tournament match for a player.
   */
  static async getCurrentMatchForPlayer(tournamentId: string, userId: string): Promise<CurrentMatchResponse | null> {
    const activeSlot = await prisma.tournamentRound.findFirst({
      where: {
        tournamentId,
        status: { in: ["READY", "IN_PROGRESS"] },
        OR: [{ playerAId: userId }, { playerBId: userId }],
      },
      orderBy: { roundNumber: "asc" },
      include: {
        tournament: { select: { gameId: true } },
      },
    });

    if (!activeSlot) return null;

    const opponentId = activeSlot.playerAId === userId ? activeSlot.playerBId : activeSlot.playerAId;

    let opponent = null;
    if (opponentId) {
      const opp = await prisma.user.findUnique({
        where: { id: opponentId },
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      });
      if (opp) {
        opponent = {
          id: opp.id,
          username: opp.username,
          displayName: opp.displayName,
          avatarUrl: opp.avatarUrl,
        };
      }
    }

    return {
      tournamentId,
      roundId: activeSlot.id,
      matchId: activeSlot.matchId ?? "",
      opponent,
      status: activeSlot.status as CurrentMatchResponse["status"],
      roundNumber: activeSlot.roundNumber,
      matchNumber: activeSlot.matchNumber,
    };
  }

  /**
   * Recovery job: find tournament slots that should have matches but don't.
   * Also detects inconsistent state (matchId exists but Match record missing).
   */
  static async recoverTournamentMatches(tournamentId?: string): Promise<{ created: number; inconsistencies: number }> {
    const where: Prisma.TournamentRoundWhereInput = {
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

    let created = 0;
    for (const slot of missingMatchSlots) {
      try {
        const matchId = await this.ensureTournamentRoundMatch(slot.id);
        if (matchId) {
          created++;
          await this.notifyMatchCreated(slot, matchId);
          await this.emitMatchCreatedEvent(slot, matchId);
        }
      } catch (error) {
        console.error(`[TOURNAMENT RECOVERY] Failed to create match for slot ${slot.id}:`, error);
      }
    }

    // Check for inconsistencies: matchId exists but Match record missing
    let inconsistencies = 0;
    const slotsWithMatchId = await prisma.tournamentRound.findMany({
      where: {
        matchId: { not: null },
        ...(tournamentId ? { tournamentId } : {}),
      },
      select: { id: true, matchId: true, tournamentId: true },
    });

    for (const slot of slotsWithMatchId) {
      if (!slot.matchId) continue;
      const match = await prisma.match.findUnique({ where: { id: slot.matchId } });
      if (!match) {
        inconsistencies++;
        console.error(`[TOURNAMENT RECOVERY] INCONSISTENCY: TournamentRound ${slot.id} references missing Match ${slot.matchId}`);
        // TODO: Expose to admin dashboard
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

    return { created, inconsistencies };
  }

}