import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@gaming-hub/db';
import { GAME_IDS } from '@gaming-hub/shared';
import { createTestUser } from '../../../test/helpers';
import { GameCoinService } from '../gameCoinService';
import { GameEntryLifecycleService } from '../gameEntryLifecycleService';
import { CouponVaultService } from '../couponVaultService';
import { WalletTransactionService } from '../walletTransactionService';
import { GameConfigService } from '../gameConfigService';

afterEach(() => vi.restoreAllMocks());
async function funded() {
  const user = await createTestUser();
  await prisma.$transaction(tx => WalletTransactionService.createCredit(tx, { userId: user.id, amount: 1000, referenceType: 'ADMIN', referenceId: crypto.randomUUID() }));
  return user.id;
}

describe('production game audit — real PostgreSQL transactions', () => {
  it.each(GAME_IDS)('%s funds and settles once without transferring winnings to CouponVault', async gameId => {
    const transfer = vi.spyOn(CouponVaultService, 'transferToCouponWallet').mockRejectedValue(new Error('Game settlement must not transfer'));
    const a = await funded(), b = await funded();
    const request = { matchId: crypto.randomUUID(), gameId, stake: 100, players: [{ userId: a, seat: 0 }, { userId: b, seat: 1 }] };
    await GameCoinService.createAndFundMatch(request);
    await GameCoinService.createAndFundMatch(request);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: a } })).balance).toBe(900);
    await Promise.all([GameCoinService.settleMatch(request.matchId, [a]), GameCoinService.settleMatch(request.matchId, [a])]);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: a } })).balance).toBe(1080);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: b } })).balance).toBe(900);
    expect(transfer).not.toHaveBeenCalled();
  });

  it.each(['bubble-shooter', 'snake-vs-worms'] as const)('%s funds all eight seats and settles the final seat once', async gameId => {
    const ids = await Promise.all(Array.from({ length: 8 }, () => funded()));
    const matchId = crypto.randomUUID();
    await GameCoinService.createAndFundMatch({ matchId, gameId, stake: 100, players: ids.map((userId, seat) => ({ userId, seat })) });
    await Promise.all([GameCoinService.settleMatch(matchId, [ids[7]!]), GameCoinService.settleMatch(matchId, [ids[7]!])]);
    const wallets = await prisma.wallet.findMany({ where: { userId: { in: ids } } });
    expect(wallets.find(w => w.userId === ids[7])!.balance).toBe(1620);
    expect(wallets.filter(w => w.userId !== ids[7]).every(w => w.balance === 900)).toBe(true);
    expect(wallets.reduce((sum, w) => sum + w.balance, 0)).toBe(7920);
  });

  it('serializes different users joining one match and never sells a third chess seat', async () => {
    const users = await Promise.all([funded(), funded(), funded()]);
    const matchId = crypto.randomUUID();
    const results = await Promise.allSettled(users.map(userId => GameEntryLifecycleService.initiateEntry({ userId, matchId, gameId: 'chess', stake: 100 })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const players = await prisma.matchPlayer.findMany({ where: { matchId }, orderBy: { seat: 'asc' } });
    expect(players.map(player => player.seat)).toEqual([0,1]);
    const wallets = await prisma.wallet.findMany({ where: { userId: { in: users } } });
    expect(wallets.map(wallet => wallet.balance).sort((a,b) => a-b)).toEqual([900,900,1000]);
  });

  it('rejects a different game joining an existing match without charging', async () => {
    const a = await funded(), b = await funded(), matchId = crypto.randomUUID();
    await GameEntryLifecycleService.initiateEntry({ userId: a, matchId, gameId: 'chess', stake: 100 });
    await expect(GameEntryLifecycleService.initiateEntry({ userId: b, matchId, gameId: 'ludo', stake: 100 })).rejects.toThrow('identity');
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: b } })).balance).toBe(1000);
  });

  it('ignores legacy unsupported Carrom player limits while preserving fees and rejects new incompatible limits', async () => {
    await prisma.siteSetting.upsert({ where: { key: 'game_config.carrom' }, create: { key: 'game_config.carrom', category: 'game_config', value: JSON.parse(JSON.stringify({ ...(await GameConfigService.getGameConfig('carrom')), maxPlayers: 4 })) }, update: {} });
    GameConfigService.invalidateCache();
    expect((await GameConfigService.getGameConfig('carrom')).maxPlayers).toBe(2);
    await expect(GameConfigService.updateGameConfig('carrom', { maxPlayers: 4 }, await funded())).rejects.toThrow('Unsupported player limits');
  });
});
