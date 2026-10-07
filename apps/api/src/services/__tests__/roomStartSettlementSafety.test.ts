import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { prisma } from '@gaming-hub/db';
import { createTestUser } from '../../../test/helpers';
import { GameCoinService } from '../gameCoinService';
import { SettlementService } from '../settlementService';
import { WalletTransactionService } from '../walletTransactionService';

describe('room-start financial validation', () => {
  async function players() {
    const users = await Promise.all([createTestUser(), createTestUser()]);
    for (const user of users) await prisma.$transaction(tx => WalletTransactionService.createCredit(tx,
      { userId: user.id, amount: 1000, referenceType: 'ADMIN', referenceId: randomUUID() }));
    return users;
  }
  it.each(['carrom', 'snake-vs-worms'] as const)('%s cannot pay out an unstarted CREATED or ACTIVE match', async gameId => {
    const users = await players();
    for (const status of ['CREATED', 'ACTIVE'] as const) {
    const match = await prisma.match.create({ data: { gameId, stake: 100, status,
      players: { create: users.map((u, seat) => ({ userId: u.id, seat })) } } });
    await expect(SettlementService.settleMatch({ matchId: match.id, winnerIds: [users[0]!.id] })).rejects.toThrow('not started');
    for (const user of users) expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(1000);
    expect(await prisma.transaction.count({ where: { referenceId: match.id, referenceType: 'MATCH_PAYOUT' } })).toBe(0);
    }
  });
  it.each(['carrom', 'snake-vs-worms'] as const)('%s fails closed if its required start checkpoint is missing, then refunds once', async gameId => {
    const users = await players(), matchId = randomUUID(), roomId = randomUUID();
    await GameCoinService.createAndFundMatch({ matchId, roomId, gameId, stake: 100,
      players: users.map((u, seat) => ({ userId: u.id, seat })),
      room: { code: randomUUID(), hostId: users[0]!.id, isPrivate: true, minPlayers: 2, maxPlayers: 2,
        settings: { requiresGameStartValidation: true } } });
    await expect(SettlementService.settleMatch({ matchId, winnerIds: [users[0]!.id] })).rejects.toThrow('not started');
    await Promise.all([GameCoinService.cancelMatch(matchId), GameCoinService.cancelMatch(matchId)]);
    for (const user of users) expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(1000);
    expect(await prisma.transaction.count({ where: { referenceId: matchId, referenceType: 'MATCH_PAYOUT' } })).toBe(0);
  });
  it.each(['carrom', 'snake-vs-worms'] as const)('%s refuses a competing refund once its started canonical result is committed', async gameId => {
    const users = await players(), matchId = randomUUID();
    await GameCoinService.createAndFundMatch({ matchId, gameId, stake: 100, players: users.map((u, seat) => ({ userId: u.id, seat })) });
    const roomId = randomUUID();
    await prisma.liveRoomCheckpoint.create({ data: { id: roomId, code: randomUUID(), matchId,
      snapshot: { room: { status: 'ended' }, match: { matchId, startedAt: Date.now() - 5000,
        startConfirmationRequired: true, gameplayStartedAt: Date.now() - 5000, finishedAt: Date.now() } } } });
    await prisma.gameResultOutbox.create({ data: { id: `${matchId}:result:v1`, roomId, matchId,
      result: { matchResult: { matchId, winnerIds: [users[0]!.id] } } } });
    await expect(GameCoinService.cancelMatch(matchId)).rejects.toThrow('committed game result');
    await Promise.all(Array.from({ length: 10 }, () => SettlementService.settleMatch({ matchId, winnerIds: [users[0]!.id] })));
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: users[0]!.id } })).balance).toBe(1080);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: users[1]!.id } })).balance).toBe(900);
    expect(await prisma.transaction.count({ where: { referenceId: matchId, referenceType: 'MATCH_PAYOUT' } })).toBe(1);
  });
});
