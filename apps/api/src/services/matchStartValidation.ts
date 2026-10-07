import type { Prisma } from '@gaming-hub/db';
import { AppError } from '@gaming-hub/shared';

/** Funding reserves entry fees. Only a committed engine result can award a room prize. */
export async function assertPaidMatchResultReady(
  tx: Prisma.TransactionClient,
  match: { id: string; status: string; stake: number; startedAt: Date | null; room: { settings: unknown } | null },
  winnerIds: string[],
): Promise<void> {
  if (match.stake <= 0) return;
  const checkpoint = await tx.liveRoomCheckpoint.findUnique({ where: { matchId: match.id } });
  const settings = match.room?.settings as Record<string, unknown> | undefined;
  if (!checkpoint) {
    if (settings?.requiresGameStartValidation || match.status !== 'ACTIVE' || !match.startedAt) {
      throw new AppError('INVALID_ACTION', 'A match that has not started cannot award a prize; cancel and refund its entry fees', 409);
    }
    return; // Compatibility for started legacy games drained under their original engine.
  }
  const snapshot = checkpoint.snapshot as unknown as {
    room?: { status?: string };
    match?: { matchId?: string; startedAt?: number; gameplayStartedAt?: number | null;
      startConfirmationRequired?: boolean; finishedAt?: number | null };
  };
  const state = snapshot.match;
  if (state?.matchId !== match.id || !Number.isFinite(state.startedAt) ||
      (state.startConfirmationRequired && !Number.isFinite(state.gameplayStartedAt)) ||
      snapshot.room?.status !== 'ended' || !Number.isFinite(state.finishedAt)) {
    throw new AppError('INVALID_ACTION', 'The authoritative room has not completed a started game', 409);
  }
  const event = await tx.gameResultOutbox.findUnique({ where: { matchId: match.id } });
  const payload = event?.result as unknown as { kind?: string; matchResult?: { matchId?: string; winnerIds?: string[] } } | undefined;
  const canonical = payload?.matchResult;
  if (!event || payload?.kind === 'CANCEL' || canonical?.matchId !== match.id || !Array.isArray(canonical.winnerIds) ||
      JSON.stringify([...new Set(canonical.winnerIds)].sort()) !== JSON.stringify([...new Set(winnerIds)].sort())) {
    throw new AppError('INVALID_ACTION', 'Settlement must match the committed engine result', 409);
  }
}
