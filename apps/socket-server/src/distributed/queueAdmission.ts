import { prisma } from '@gaming-hub/db';
import { AppError } from '@gaming-hub/shared';

/** Cancel a waiting search without taking a player out of an assigned pairing. */
export async function leaveQueueForRoom(playerId: string, destinationRoomId?: string): Promise<void> {
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('shared-matchmaking'))`;
    const assigned = await tx.matchmakingQueue.findFirst({ where: {
      userId: playerId, status: 'MATCHED', expiresAt: { gt: new Date() },
    } });
    if (assigned && assigned.roomId !== destinationRoomId) {
      throw new AppError('INVALID_ACTION', 'You are already being matched. Please wait for your assigned room.', 409);
    }
    await tx.matchmakingQueue.updateMany({ where: { userId: playerId, status: 'WAITING' }, data: { status: 'CANCELLED' } });
  });
}
