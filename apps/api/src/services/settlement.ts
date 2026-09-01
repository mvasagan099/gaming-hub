import { prisma } from "@gaming-hub/db";
import { GameCoinService, PAYOUT_RATE } from "./gameCoinService";
import type { SettlementResult } from "./gameCoinService";

export { PAYOUT_RATE, GameCoinService };
export type { SettlementResult };

export async function holdMatchWagers(matchId: string) {
  return GameCoinService.reserveMatchEntry(matchId);
}

export async function settleMatch(matchId: string, rated = true): Promise<SettlementResult> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { winnerIds: true },
  });
  const winnerIds = (match?.winnerIds as string[]) || [];
  return GameCoinService.settleMatch(matchId, winnerIds, { rated });
}
