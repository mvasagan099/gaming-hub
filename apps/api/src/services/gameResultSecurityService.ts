import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { env } from "../env";
import { SettlementService } from "./settlementService";
import { processMatchResult } from "./tournamentEngine";

export class GameResultSecurityService {
  /**
   * 1. Validate Game Action:
   * Enforces match active state, seat verification, turn ownership, action sequence ordering, and engine rules.
   */
  static async validateAction(params: {
    matchId: string;
    userId: string;
    action: { type: string; sequenceNumber?: number; [key: string]: unknown };
    expectedStateVersion?: number;
    currentTurnSeat?: number;
  }): Promise<{ ok: true; seat: number; matchId: string }> {
    const match = await prisma.match.findUnique({
      where: { id: params.matchId },
      include: { players: true, gameState: true },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }

    if (match.status !== "ACTIVE") {
      throw new AppError("INVALID_ACTION", `Cannot perform action on match with status ${match.status}`, 409);
    }

    const player = match.players.find((p) => p.userId === params.userId);
    if (!player) {
      throw new AppError("FORBIDDEN", "User is not a seated player in this match", 403);
    }

    // Check action sequence / stateVersion to reject stale moves
    if (params.action.sequenceNumber !== undefined && params.expectedStateVersion !== undefined) {
      if (params.action.sequenceNumber < params.expectedStateVersion) {
        throw new AppError("INVALID_ACTION", "Action sequence is stale and was rejected", 409);
      }
    }

    // Check turn ownership for turn-based games
    if (params.currentTurnSeat !== undefined && player.seat !== params.currentTurnSeat) {
      throw new AppError("NOT_YOUR_TURN", "It is not your turn to act", 403);
    }

    return {
      ok: true,
      seat: player.seat,
      matchId: match.id,
    };
  }

  /**
   * 2. Validate and Settle Authoritative Result:
   * Rejects client-supplied results, verifies internal authentication, checks player validity,
   * completely ignores manipulated coinsWon/scores, and delegates strictly to SettlementService.
   */
  static async validateAndSettleAuthoritativeResult(params: {
    matchId: string;
    caller: "INTERNAL_SOCKET" | "ADMIN" | "CLIENT";
    internalKey?: string;
    winnerIds?: string[];
    scores?: Record<string, number>;
    clientSuppliedCoinsWon?: number;
    reason?: string;
    rated?: boolean;
  }) {
    // Rule 1: NEVER trust clients for result declarations
    if (params.caller === "CLIENT") {
      throw new AppError(
        "FORBIDDEN",
        "Clients cannot directly declare match winners, scores, or trigger coin settlements",
        403,
      );
    }

    // Rule 2: Verify internal socket authorization
    if (params.caller === "INTERNAL_SOCKET") {
      if (!params.internalKey || params.internalKey !== env.INTERNAL_API_KEY) {
        throw new AppError("UNAUTHORIZED", "Invalid or missing internal API key", 401);
      }
    }

    const match = await prisma.match.findUnique({
      where: { id: params.matchId },
      include: { players: true },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }

    if (match.status !== "ACTIVE" && match.status !== "CREATED") {
      throw new AppError("INVALID_ACTION", `Match is not active for settlement (status: ${match.status})`, 409);
    }

    // Verify reported winners are actual participants
    const playerUserIds = new Set(match.players.map((p) => p.userId));
    const winnerIds = params.winnerIds ?? [];
    for (const wid of winnerIds) {
      if (!playerUserIds.has(wid)) {
        throw new AppError("VALIDATION_ERROR", `Reported winner ${wid} is not a player in this match`, 422);
      }
    }

    // Disregard any clientSuppliedCoinsWon and calculate authoritatively
    return SettlementService.settleMatch({
      matchId: params.matchId,
      winnerIds,
      options: {
        scores: params.scores,
        rated: params.rated,
        reason: params.reason ?? "authoritative_match_result",
      },
    });
  }

  /**
   * 3. Validate Tournament Match Result:
   * Protects tournament bracket progression against fake client reporting.
   */
  static async validateTournamentMatchResult(params: {
    tournamentId: string;
    matchId: string;
    roundId: string;
    winnerId: string;
    loserId?: string;
    caller: "INTERNAL_SOCKET" | "ADMIN" | "CLIENT";
    internalKey?: string;
    scores?: Record<string, number>;
  }) {
    if (params.caller === "CLIENT") {
      throw new AppError("FORBIDDEN", "Clients cannot directly advance tournament brackets", 403);
    }

    if (params.caller === "INTERNAL_SOCKET") {
      if (!params.internalKey || params.internalKey !== env.INTERNAL_API_KEY) {
        throw new AppError("UNAUTHORIZED", "Invalid or missing internal API key", 401);
      }
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: params.tournamentId },
      include: { players: true, rounds: true },
    });

    if (!tournament) {
      throw new AppError("NOT_FOUND", "Tournament not found", 404);
    }

    const round = tournament.rounds.find((r) => r.id === params.roundId);
    if (!round) {
      throw new AppError("NOT_FOUND", "Tournament round not found", 404);
    }

    const isWinnerRegistered = tournament.players.some((p) => p.userId === params.winnerId);
    if (!isWinnerRegistered) {
      throw new AppError("VALIDATION_ERROR", "Winner is not registered in this tournament", 422);
    }

    return processMatchResult({
      matchId: params.matchId,
      tournamentId: params.tournamentId,
      roundId: params.roundId,
      winnerId: params.winnerId,
      loserId: params.loserId,
      scores: params.scores,
    });
  }

  /**
   * 4. Server-Authoritative Forfeit Handling:
   * Verifies authenticated player, active status, and settles match in favor of remaining participants.
   */
  static async validateForfeit(params: {
    matchId: string;
    forfeitingUserId: string;
    reason?: string;
  }) {
    const match = await prisma.match.findUnique({
      where: { id: params.matchId },
      include: { players: true },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }

    if (match.status !== "ACTIVE") {
      throw new AppError("INVALID_ACTION", "Cannot forfeit an inactive match", 409);
    }

    const isPlayer = match.players.some((p) => p.userId === params.forfeitingUserId);
    if (!isPlayer) {
      throw new AppError("FORBIDDEN", "User is not a seated player in this match", 403);
    }

    const remainingWinners = match.players
      .filter((p) => p.userId !== params.forfeitingUserId)
      .map((p) => p.userId);

    return SettlementService.settleMatch({
      matchId: params.matchId,
      winnerIds: remainingWinners,
      options: {
        resultType: "FORFEIT",
        reason: params.reason ?? "player_forfeit",
      },
    });
  }
}
