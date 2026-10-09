import { createHash, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@gaming-hub/db';
import { AppError } from '@gaming-hub/shared';
import { createTestCoupon, createTestUser } from '../../../test/helpers';
import { applyTransaction } from '../wallet';
import { redeemCoupon } from '../coupons';
import { CouponVaultService } from '../couponVaultService';
import { AffiliateService } from '../affiliateService';
import { resolveTournamentDispute } from '../tournamentDisputeService';
import { requestWithdrawalOtp, verifyWalletOtp } from '../walletRequests';
import { setSetting, resetSettingsCache } from '../settings';
import { adminRoutes } from '../../routes/admin';
import { adminTournamentsRoutes } from '../../routes/adminTournaments';
import { walletRoutes } from '../../routes/wallet';
import { couponsRoutes } from '../../routes/coupons';
import { internalRoutes } from '../../routes/internal';
import { env } from '../../env';
import { recordLoginSession, hashToken } from '../sessions';

describe('PostgreSQL financial boundary regressions', () => {
  let user: Awaited<ReturnType<typeof createTestUser>>;
  let couponIds: string[] = [], matchIds: string[] = [], tournamentIds: string[] = [];
  let app: ReturnType<typeof Fastify> | undefined;
  beforeEach(async () => {
    user = await createTestUser(); couponIds = []; matchIds = []; tournamentIds = [];
    resetSettingsCache();
  });
  afterEach(async () => {
    vi.restoreAllMocks(); await app?.close(); app = undefined;
    await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
    await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
    await prisma.coupon.deleteMany({ where: { id: { in: couponIds } } });
    await prisma.siteSetting.deleteMany({ where: { category: { in: ['wallet', 'referral'] } } });
    resetSettingsCache();
  });
  async function coupon(status = 'EXTERNAL_CONFIRMED') {
    const c = await createTestCoupon({ code: ('S-'+randomUUID()).toUpperCase() }); couponIds.push(c.id);
    const saga = await prisma.couponRedemption.create({ data: {
      couponId: c.id, userId: user.id, value: 100, sagaStatus: status,
      couponCodeHash: createHash('sha256').update(c.code).digest('hex'),
      externalTxId: 'CPN-'+c.id,
      externalConfirmedAt: status === 'EXTERNAL_CONFIRMED' ? new Date() : null,
    } });
    return { c, saga };
  }
  async function adminApp() {
    const admin = await createTestUser({ role: 'ADMIN' });
    await prisma.profile.update({ where: { userId: admin.id }, data: { twoFactorEnabled: true } });
    await recordLoginSession({ userId: admin.id, token: admin.token, ip: null, userAgent: null });
    await prisma.loginSession.update({ where: { tokenHash: hashToken(admin.token) }, data: { mfaVerifiedAt: new Date() } });
    app = Fastify();
    app.setErrorHandler((e: any, _req: any, reply: any) => reply.code(e.statusCode ?? 500).send({ error: { code: e.code, message: e.message } }));
    await app.register(adminRoutes); await app.register(adminTournamentsRoutes);
    return admin;
  }
  it('concurrent confirmed coupon recovery makes exactly one ledger credit', async () => {
    const { c } = await coupon();
    vi.spyOn(CouponVaultService, 'verifyCoupon').mockResolvedValue({ success: true, couponId: c.id, amount: 100 } as any);
    const external = vi.spyOn(CouponVaultService, 'redeemCoupon');
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => redeemCoupon(user.id, c.code)));
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(100);
    expect(await prisma.transaction.count({ where: { userId: user.id, referenceId: c.id, referenceType: 'DEPOSIT' } })).toBe(1);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: c.id } })).usedCount).toBe(1);
    expect(external).not.toHaveBeenCalled();
  });
  it('confirmed recovery uses persisted amount even if provider now reports used', async () => {
    const { c } = await coupon();
    const verify = vi.spyOn(CouponVaultService, 'verifyCoupon').mockRejectedValue(new AppError('COUPON_ALREADY_USED', 'Used', 409));
    await expect(redeemCoupon(user.id, c.code)).resolves.toMatchObject({ success: true, value: 100 });
    expect(verify).not.toHaveBeenCalled();
  });
  it('an unacknowledged persisted pending saga never repeats the external redemption', async () => {
    const { c, saga } = await coupon('PENDING');
    vi.spyOn(CouponVaultService, 'verifyCoupon').mockResolvedValue({ success: true, couponId: c.id, amount: 100 } as any);
    const external = vi.spyOn(CouponVaultService, 'redeemCoupon').mockResolvedValue({ success: true });
    await expect(redeemCoupon(user.id, c.code)).rejects.toMatchObject({ code: 'COUPON_CREDIT_FAILED' });
    expect(external).not.toHaveBeenCalled();
    expect((await prisma.couponRedemption.findUniqueOrThrow({ where: { id: saga.id } })).sagaStatus).toBe('NEEDS_RECONCILIATION');
  });
  it('unknown redemption outcome is held and a retry never credits or calls provider again', async () => {
    const c = await createTestCoupon({ code: ('S-'+randomUUID()).toUpperCase() }); couponIds.push(c.id);
    vi.spyOn(CouponVaultService, 'verifyCoupon').mockResolvedValue({ success: true, couponId: c.id, amount: 100 } as any);
    const external = vi.spyOn(CouponVaultService, 'redeemCoupon').mockRejectedValue(new AppError('COUPON_SERVICE_UNAVAILABLE', 'Timeout', 503));
    await expect(redeemCoupon(user.id, c.code)).rejects.toBeDefined();
    await expect(redeemCoupon(user.id, c.code)).rejects.toBeDefined();
    expect(external).toHaveBeenCalledTimes(1);
    expect((await prisma.couponRedemption.findFirstOrThrow({ where: { couponId: c.id } })).sagaStatus).toBe('NEEDS_RECONCILIATION');
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(0);
  });
  it('real redeem route concurrently recovers one confirmed local credit', async () => {
    const { c } = await coupon();
    await recordLoginSession({ userId: user.id, token: user.token, ip: null, userAgent: null });
    app = Fastify();
    app.setErrorHandler((e: any, _req: any, reply: any) => reply.code(e.statusCode ?? 500).send({ error: { code: e.code } }));
    await app.register(couponsRoutes);
    const external = vi.spyOn(CouponVaultService, 'redeemCoupon');
    const responses = await Promise.all([1, 2, 3].map(() => app!.inject({ method: 'POST', url: '/api/coupons/redeem', headers: { authorization: `Bearer ${user.token}` }, payload: { code: c.code } })));
    expect(responses.every(r => r.statusCode === 200)).toBe(true);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(100);
    expect(await prisma.transaction.count({ where: { userId: user.id, referenceId: c.id } })).toBe(1);
    expect(external).not.toHaveBeenCalled();
  });
  it('generic provider 409 is held without ownership proof and never grants credit', async () => {
    const c = await createTestCoupon({ code: ('S-'+randomUUID()).toUpperCase() }); couponIds.push(c.id);
    vi.spyOn(CouponVaultService, 'verifyCoupon').mockResolvedValue({ success: true, couponId: c.id, amount: 100 } as any);
    const external = vi.spyOn(CouponVaultService, 'redeemCoupon').mockRejectedValue(new AppError('COUPON_ALREADY_USED', 'Conflict', 409));
    await expect(redeemCoupon(user.id, c.code)).rejects.toMatchObject({ statusCode: 409 });
    await expect(redeemCoupon(user.id, c.code)).rejects.toMatchObject({ code: 'COUPON_CREDIT_FAILED' });
    expect(external).toHaveBeenCalledTimes(1);
    expect((await prisma.couponRedemption.findFirstOrThrow({ where: { couponId: c.id } })).sagaStatus).toBe('NEEDS_RECONCILIATION');
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
  });
  it('generic provider 400 cannot prove nonprocessing after an RPC timeout', async () => {
    const c = await createTestCoupon({ code: ('S-'+randomUUID()).toUpperCase() }); couponIds.push(c.id);
    vi.spyOn(CouponVaultService, 'verifyCoupon').mockResolvedValue({ success: true, couponId: c.id, amount: 100 } as any);
    vi.spyOn(CouponVaultService, 'redeemCoupon').mockRejectedValue(new AppError('COUPON_INVALID', 'REDEEM_FAILED: upstream timeout', 400));
    await expect(redeemCoupon(user.id, c.code)).rejects.toBeDefined();
    expect((await prisma.couponRedemption.findFirstOrThrow({ where: { couponId: c.id } })).sagaStatus).toBe('NEEDS_RECONCILIATION');
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
  });
  it('confirmed local credit failure rolls back and retries once without external re-verification', async () => {
    const { c, saga } = await coupon();
    const verify = vi.spyOn(CouponVaultService, 'verifyCoupon');
    const transaction = prisma.$transaction.bind(prisma);
    vi.spyOn(prisma, '$transaction').mockImplementationOnce((async (callback: any) => transaction(async tx => {
      await callback(tx);
      throw new Error('Injected local commit failure');
    })) as any);
    await expect(redeemCoupon(user.id, c.code)).rejects.toMatchObject({ code: 'COUPON_CREDIT_FAILED' });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(0);
    expect((await prisma.couponRedemption.findUniqueOrThrow({ where: { id: saga.id } })).sagaStatus).toBe('NEEDS_RECONCILIATION');
    await expect(redeemCoupon(user.id, c.code)).resolves.toMatchObject({ success: true });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(100);
    expect(await prisma.transaction.count({ where: { id: saga.id } })).toBe(1);
    expect(verify).not.toHaveBeenCalled();
  });
  it('wrong OTP attempts survive the enclosing request transaction rollback', async () => {
    const { debugCode } = await requestWithdrawalOtp(user.id);
    const wrong = debugCode === '000000' ? '000001' : '000000';
    await expect(prisma.$transaction(tx => verifyWalletOtp(user.id, wrong, tx))).rejects.toMatchObject({ code: 'OTP_INVALID' });
    expect((await prisma.walletOtp.findFirstOrThrow({ where: { userId: user.id } })).attempts).toBe(1);
  });
  it('concurrent wrong OTP attempts cannot exceed the budget or leave valid authorization usable', async () => {
    await setSetting('wallet.otpMaxAttempts', 2, null);
    const { debugCode } = await requestWithdrawalOtp(user.id);
    const wrong = debugCode === '000000' ? '000001' : '000000';
    await Promise.allSettled(Array.from({ length: 5 }, () => prisma.$transaction(tx => verifyWalletOtp(user.id, wrong, tx))));
    expect((await prisma.walletOtp.findFirstOrThrow({ where: { userId: user.id } })).attempts).toBe(2);
    await expect(verifyWalletOtp(user.id, debugCode!)).rejects.toMatchObject({ code: 'OTP_TOO_MANY_ATTEMPTS' });
  });
  it('one correct OTP authorizes only one concurrent transaction', async () => {
    const { debugCode } = await requestWithdrawalOtp(user.id);
    const results = await Promise.allSettled([1, 2].map(() => prisma.$transaction(tx => verifyWalletOtp(user.id, debugCode!, tx))));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('withdrawal route persists failed OTP attempts and exhausts the budget', async () => {
    await setSetting('wallet.otpMaxAttempts', 2, null);
    await prisma.$transaction(tx => applyTransaction(tx, user.id, 1000, 'DEPOSIT', 'fixture'));
    await recordLoginSession({ userId: user.id, token: user.token, ip: null, userAgent: null });
    app = Fastify();
    app.setErrorHandler((e: any, _req: any, reply: any) => reply.code(e.statusCode ?? 500).send({ error: { code: e.code } }));
    await app.register(walletRoutes);
    const { debugCode } = await requestWithdrawalOtp(user.id);
    const wrong = debugCode === '000000' ? '000001' : '000000';
    const send = (otp: string) => app!.inject({ method: 'POST', url: '/api/wallet/withdraw', headers: { authorization: `Bearer ${user.token}` }, payload: { amount: 100, otp } });
    expect((await send(wrong)).json().error.code).toBe('OTP_INVALID');
    expect((await send(wrong)).json().error.code).toBe('OTP_INVALID');
    const exhausted = await send(debugCode!);
    expect(exhausted.statusCode).toBe(429); expect(exhausted.json().error.code).toBe('OTP_TOO_MANY_ATTEMPTS');
    expect(await prisma.walletRequest.count({ where: { userId: user.id } })).toBe(0);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(1000);
  });
  it('parallel invalid withdrawal OTPs cannot exhaust the database pool while holding wallet locks', async () => {
    await setSetting('wallet.otpMaxAttempts', 2, null);
    await prisma.$transaction(tx => applyTransaction(tx, user.id, 1000, 'DEPOSIT', 'fixture'));
    await recordLoginSession({ userId: user.id, token: user.token, ip: null, userAgent: null });
    app = Fastify();
    app.setErrorHandler((e: any, _req: any, reply: any) => reply.code(e.statusCode ?? 500).send({ error: { code: e.code } }));
    await app.register(walletRoutes);
    const { debugCode } = await requestWithdrawalOtp(user.id);
    const otp = debugCode === '000000' ? '000001' : '000000';
    const responses = await Promise.all([1, 2, 3].map(() => app!.inject({ method: 'POST', url: '/api/wallet/withdraw', headers: { authorization: `Bearer ${user.token}` }, payload: { amount: 100, otp } })));
    expect(responses.every(r => r.statusCode === 400 || r.statusCode === 429)).toBe(true);
    expect((await prisma.walletOtp.findFirstOrThrow({ where: { userId: user.id } })).attempts).toBe(2);
    expect(await prisma.walletRequest.count({ where: { userId: user.id } })).toBe(0);
  });
  it.each(['MAIN', 'BONUS', 'LOCKED'] as const)('frozen wallet atomically denies %s debit while allowing refund credits', async bucket => {
    await prisma.$transaction(tx => applyTransaction(tx, user.id, 100, 'WAGER_REFUND', 'fixture', {}, bucket));
    await prisma.wallet.update({ where: { userId: user.id }, data: { isFrozen: true } });
    await expect(prisma.$transaction(tx => applyTransaction(tx, user.id, -50, 'TOURNAMENT_ENTRY', 'fixture', {}, bucket))).rejects.toMatchObject({ code: 'WALLET_FROZEN' });
    await expect(prisma.$transaction(tx => applyTransaction(tx, user.id, 20, 'WAGER_REFUND', 'refund', {}, bucket))).resolves.toBeDefined();
    expect(await prisma.transaction.count({ where: { userId: user.id, type: 'DEBIT' } })).toBe(0);
  });
  it('a freeze that owns the wallet lock wins over an overlapping debit', async () => {
    await prisma.$transaction(tx => applyTransaction(tx, user.id, 100, 'WAGER_REFUND', 'fixture'));
    let held!: () => void, release!: () => void;
    const ownsLock = new Promise<void>(resolve => { held = resolve; });
    const releaseLock = new Promise<void>(resolve => { release = resolve; });
    const freeze = prisma.$transaction(async tx => {
      await tx.wallet.update({ where: { userId: user.id }, data: { isFrozen: true } });
      held(); await releaseLock;
    });
    await ownsLock;
    const debit = prisma.$transaction(tx => applyTransaction(tx, user.id, -50, 'TOURNAMENT_ENTRY', 'fixture'));
    const rejection = expect(debit).rejects.toMatchObject({ code: 'WALLET_FROZEN' });
    release(); await freeze; await rejection;
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(100);
    expect(await prisma.transaction.count({ where: { userId: user.id, type: 'DEBIT' } })).toBe(0);
  });
  it.each(['/wallet/adjust', '/wallet'])('admin adjustment %s retries have one financial effect', async suffix => {
    const admin = await adminApp(), key = randomUUID();
    const send = () => app!.inject({ method: 'POST', url: `/api/admin/users/${user.id}${suffix}`, headers: { authorization: `Bearer ${admin.token}`, 'idempotency-key': key }, payload: { amount: 100, reason: 'Controlled correction' } });
    const first = await send(); expect(first.statusCode).toBe(200);
    const second = await send(); expect(second.statusCode).toBe(200);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(100);
    expect(await prisma.transaction.count({ where: { userId: user.id, referenceType: 'ADMIN' } })).toBe(1);
  });
  it('admin adjustment requires a retry identity and rejects conflicting payloads', async () => {
    const admin = await adminApp();
    const send = (amount: number, key?: string) => app!.inject({ method: 'POST', url: `/api/admin/users/${user.id}/wallet/adjust`, headers: { authorization: `Bearer ${admin.token}`, ...(key ? { 'idempotency-key': key } : {}) }, payload: { amount, reason: 'Controlled correction' } });
    expect((await send(100)).statusCode).toBe(400);
    const key = randomUUID(); expect((await send(100, key)).statusCode).toBe(200);
    expect((await send(200, key)).statusCode).toBe(409);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(100);
  });
  it('parallel admin adjustment retries create one ledger effect across aliases', async () => {
    const admin = await adminApp(), key = randomUUID();
    const send = (suffix: string) => app!.inject({ method: 'POST', url: `/api/admin/users/${user.id}${suffix}`, headers: { authorization: `Bearer ${admin.token}` }, payload: { amount: 100, reason: 'Parallel correction', idempotencyKey: key } });
    const results = await Promise.all(['/wallet', '/wallet/adjust', '/wallet'].map(send));
    expect(results.some(r => r.statusCode === 200)).toBe(true);
    expect(results.every(r => r.statusCode === 200 || r.statusCode === 409)).toBe(true);
    expect((await send('/wallet')).statusCode).toBe(200);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(100);
    expect(await prisma.transaction.count({ where: { userId: user.id, referenceType: 'ADMIN' } })).toBe(1);
  });
  it('concurrent secondary match funding reserves each player stake once', async () => {
    const other = await createTestUser();
    for (const id of [user.id, other.id]) await prisma.$transaction(tx => applyTransaction(tx, id, 1000, 'WAGER_REFUND', 'fixture'));
    const match = await prisma.match.create({ data: { gameId: 'chess', stake: 50, players: { create: [{ userId: user.id, seat: 0 }, { userId: other.id, seat: 1 }] } } }); matchIds.push(match.id);
    app = Fastify();
    await app.register(internalRoutes);
    const responses = await Promise.all([1, 2, 3].map(() => app!.inject({ method: 'POST', url: `/internal/matches/${match.id}/hold-wagers`, headers: { 'x-internal-key': env.INTERNAL_API_KEY } })));
    expect(responses.every(r => r.statusCode === 200)).toBe(true);
    for (const id of [user.id, other.id]) {
      expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: id } })).balance).toBe(950);
      expect(await prisma.transaction.count({ where: { userId: id, referenceId: match.id, referenceType: 'MATCH_WAGER' } })).toBe(1);
    }
  });
  it('affiliate cannot fabricate a commission without a real deposit ledger record', async () => {
    const referrer = await createTestUser();
    await prisma.referral.create({ data: { referrerId: referrer.id, referredUserId: user.id, code: 'fixture' } });
    await setSetting('referral.enabled', true, null); await setSetting('referral.affiliateEnabled', true, null);
    expect(await AffiliateService.processDepositCommission({ userId: user.id, amount: 1000, transactionId: randomUUID() })).toBeNull();
    expect(await prisma.affiliateCommission.count({ where: { referredUserId: user.id } })).toBe(0);
  });
  async function referredDeposit() {
    const referrer = await createTestUser();
    await prisma.referral.create({ data: { referrerId: referrer.id, referredUserId: user.id, code: 'fixture' } });
    await setSetting('referral.enabled', true, null); await setSetting('referral.affiliateEnabled', true, null);
    await setSetting('referral.affiliateMode', 'CONTINUOUS', null);
    const wallet: any = await prisma.$transaction(tx => applyTransaction(tx, user.id, 1000, 'DEPOSIT', randomUUID()));
    return { referrer, transactionId: wallet._transaction.id as string };
  }
  it('normal affiliate delivery followed by reconciliation credits the source once', async () => {
    const { referrer, transactionId } = await referredDeposit();
    await AffiliateService.processDepositCommission({ transactionId });
    await AffiliateService.reconcileCommissions({ userId: user.id });
    expect(await prisma.affiliateCommission.count({ where: { referredUserId: user.id } })).toBe(1);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: referrer.id } })).bonusBalance).toBe(50);
  });
  it('provider source aliases cannot grant multiple affiliate commissions for one deposit', async () => {
    const { referrer, transactionId } = await referredDeposit();
    for (const sourceType of ['GAME_WALLET_DEPOSIT', 'DEPOSIT', 'COUPON_REDEMPTION']) await AffiliateService.processDepositCommission({ transactionId, sourceType });
    expect(await prisma.affiliateCommission.count({ where: { referredUserId: user.id } })).toBe(1);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: referrer.id } })).bonusBalance).toBe(50);
  });
  it('parallel reversal creates one compensating ledger entry', async () => {
    const { referrer, transactionId } = await referredDeposit();
    const commission = await AffiliateService.processDepositCommission({ transactionId });
    await prisma.$transaction(tx => applyTransaction(tx, referrer.id, 100, 'BONUS', 'fixture', {}, 'BONUS'));
    await Promise.all([1, 2].map(() => AffiliateService.reverseCommission(commission!.id, user.id, 'Controlled reversal')));
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: referrer.id } })).bonusBalance).toBe(100);
    expect(await prisma.transaction.count({ where: { userId: referrer.id, referenceType: 'AFFILIATE_COMMISSION_REVERSAL' } })).toBe(1);
  });
  async function paidDispute() {
    const other = await createTestUser();
    const t = await prisma.tournament.create({ data: { gameId: 'chess', title: 'Safety fixture', description: 'Fixture', startTime: new Date(), status: 'COMPLETED' } }); tournamentIds.push(t.id);
    const a = await prisma.tournamentPlayer.create({ data: { tournamentId: t.id, userId: user.id } });
    await prisma.tournamentPlayer.create({ data: { tournamentId: t.id, userId: other.id } });
    const m = await prisma.match.create({ data: { gameId: 'chess', status: 'FINISHED', winnerIds: [user.id] } }); matchIds.push(m.id);
    const round = await prisma.tournamentRound.create({ data: { tournamentId: t.id, matchId: m.id, roundNumber: 1, playerAId: user.id, playerBId: other.id, winnerId: user.id } });
    await prisma.tournamentPrize.create({ data: { tournamentId: t.id, userId: user.id, playerId: a.id, rank: 1, amount: 100, status: 'PAID' } });
    // Credit and spent prize are both ledger-backed: the loser now has no funds to reverse.
    await prisma.$transaction(async tx => {
      await applyTransaction(tx, user.id, 100, 'TOURNAMENT_PRIZE', t.id);
      await applyTransaction(tx, user.id, -100, 'MATCH_WAGER', 'spent-fixture');
    });
    const dispute = await prisma.tournamentDispute.create({ data: { tournamentId: t.id, matchId: m.id, userId: other.id, disputeId: randomUUID(), reason: 'WRONG_RESULT', description: 'Review requested' } });
    return { other, round, dispute };
  }
  it('failed prize reversal rolls back result correction and replacement credit', async () => {
    const { other, round, dispute } = await paidDispute();
    await expect(resolveTournamentDispute(user.id, dispute.id, { action: 'OVERRIDE_RESULT', newWinnerId: other.id, justificationReason: 'Controlled correction' })).rejects.toBeDefined();
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: other.id } })).balance).toBe(0);
    expect((await prisma.tournamentRound.findUniqueOrThrow({ where: { id: round.id } })).winnerId).toBe(user.id);
    expect((await prisma.tournamentDispute.findUniqueOrThrow({ where: { id: dispute.id } })).status).toBe('OPEN');
  });
  it('concurrent successful prize correction conserves funds and retries once', async () => {
    const { other, round, dispute } = await paidDispute();
    await prisma.$transaction(tx => applyTransaction(tx, user.id, 100, 'WAGER_REFUND', 'fixture'));
    const payload = { action: 'OVERRIDE_RESULT' as const, newWinnerId: other.id, justificationReason: 'Controlled correction' };
    await Promise.all([1, 2, 3].map(() => resolveTournamentDispute(user.id, dispute.id, payload)));
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } })).balance).toBe(0);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: other.id } })).balance).toBe(100);
    expect((await prisma.tournamentRound.findUniqueOrThrow({ where: { id: round.id } })).winnerId).toBe(other.id);
    expect((await prisma.tournamentDispute.findUniqueOrThrow({ where: { id: dispute.id } })).status).toBe('RESOLVED');
    expect(await prisma.transaction.count({ where: { referenceId: dispute.id, referenceType: 'REVERSAL' } })).toBe(1);
    expect(await prisma.transaction.count({ where: { userId: other.id, referenceType: 'TOURNAMENT_PRIZE' } })).toBe(1);
    await expect(resolveTournamentDispute(user.id, dispute.id, { ...payload, newWinnerId: user.id })).rejects.toMatchObject({ statusCode: 409 });
  });
  it('review-only administrators cannot override financial match results', async () => {
    const admin = await adminApp();
    const role = await prisma.customRole.create({ data: { name: 'review_'+randomUUID(), displayName: 'Review only', permissions: { create: [{ permission: 'tournaments.disputes.review' }] } } });
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'CUSTOM', customRoleId: role.id } });
    const { other, dispute } = await paidDispute();
    const res = await app!.inject({ method: 'POST', url: `/api/admin/tournaments/disputes/${dispute.id}/resolve`, headers: { authorization: `Bearer ${admin.token}` }, payload: { action: 'OVERRIDE_RESULT', newWinnerId: other.id, justificationReason: 'Controlled correction' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });
});
