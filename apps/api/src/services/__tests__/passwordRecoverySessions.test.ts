import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@gaming-hub/db';
const provider = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('../../auth/supabase', () => ({ verifyAccessToken: provider.verify }));
import { authRoutes } from '../../routes/auth';
import { hashToken, recordLoginSession } from '../sessions';
import { revalidateSocketUser } from '../../../../../apps/socket-server/src/auth';

describe('password recovery application-session invalidation', () => {
  let app: ReturnType<typeof Fastify>, owner: string, other: string;
  let token: string, oldToken: string, otherToken: string;
  const expiry = () => new Date(Date.now() + 3_600_000);
  beforeEach(async () => {
    owner = randomUUID(); other = randomUUID(); token = `recovery-${owner}`; oldToken = `old-${owner}`; otherToken = `other-${other}`;
    for (const id of [owner, other]) await prisma.user.create({ data: { id, username: `u_${id}`, displayName: 'Recovery fixture', email: `${id}@test.invalid`, profile: { create: { twoFactorEnabled: true } } } });
    for (const [userId, credential] of [[owner, oldToken], [other, otherToken]]) await prisma.loginSession.create({ data: { userId, tokenHash: hashToken(credential), expiresAt: expiry(), mfaVerifiedAt: new Date(), providerSessionId: credential } });
    provider.verify.mockImplementation(async (credential: string) => {
      if (![token, oldToken, otherToken].includes(credential)) throw new Error('Invalid signature');
      return { sub: credential === otherToken ? other : owner, emailVerified: true, email: `${owner}@test.invalid`, issuedAt: Date.now()/1000, expiresAt: expiry(), providerSessionId: credential, userMetadata: null };
    });
    app = Fastify(); app.setErrorHandler((error: any, _request: FastifyRequest, reply: FastifyReply) => reply.code(error.statusCode ?? 500).send({ error: { code: error.code } }));
    await app.register(authRoutes);
  });
  afterEach(async () => { await app.close(); await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } }); vi.resetAllMocks(); });
  const logout = (credential?: string, body = {}) => app.inject({ method: 'POST', url: '/api/auth/logout-all', headers: credential ? { authorization: `Bearer ${credential}` } : {}, payload: body });
  it('allows recovery-only self logout without Gaming Hub MFA and rejects the old API and socket sessions', async () => {
    expect((await logout(token)).statusCode).toBe(200);
    const revoked = await prisma.loginSession.findUniqueOrThrow({ where: { tokenHash: hashToken(oldToken) } });
    expect(revoked.revokedAt).not.toBeNull(); expect(revoked.mfaVerifiedAt).toBeNull(); expect(revoked.isCurrent).toBe(false);
    expect((await app.inject({ url: '/api/auth/me', headers: { authorization: `Bearer ${oldToken}` } })).statusCode).toBe(401);
    await expect(revalidateSocketUser({ userId: owner, username: 'fixture', displayName: 'Fixture', avatarUrl: null, role: 'USER', tokenHash: hashToken(oldToken), expiresAtMs: expiry().getTime() })).rejects.toThrow('SESSION_REVOKED');
  });
  it('ignores forged user identity in the body and preserves other accounts', async () => {
    expect((await logout(token, { userId: other })).statusCode).toBe(200);
    expect((await prisma.loginSession.findUniqueOrThrow({ where: { tokenHash: hashToken(otherToken) } })).revokedAt).toBeNull();
  });
  it('is idempotent and cannot revoke a later legitimate login on replay', async () => {
    await logout(token);
    const newer = await recordLoginSession({ userId: owner, token: 'new-login', providerSessionId: 'new-provider', ip: null, userAgent: null });
    expect((await logout(token)).statusCode).toBe(200);
    expect((await prisma.loginSession.findUniqueOrThrow({ where: { id: newer.id } })).revokedAt).toBeNull();
  });
  it('blocks refreshed recovery credentials through retained provider-session tombstones', async () => {
    await logout(token);
    await expect(recordLoginSession({ userId: owner, token: 'refreshed', providerSessionId: token, ip: null, userAgent: null })).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });
  it('rejects missing and invalid credentials without revoking sessions', async () => {
    expect((await logout()).statusCode).toBe(401); expect((await logout('forged')).statusCode).toBe(401);
    expect((await prisma.loginSession.findUniqueOrThrow({ where: { tokenHash: hashToken(oldToken) } })).revokedAt).toBeNull();
  });
  it('serializes concurrent completion into one recovery tombstone', async () => {
    const results = await Promise.all([logout(token), logout(token)]);
    expect(results.map(r => r.statusCode)).toEqual([200, 200]);
    expect(await prisma.loginSession.count({ where: { tokenHash: hashToken(token) } })).toBe(1);
  });
  it('does not mistake a rotated token for a fully revoked provider session', async () => {
    await prisma.loginSession.update({ where: { tokenHash: hashToken(oldToken) }, data: { providerSessionId: token } });
    await recordLoginSession({ userId: owner, token: 'active-refresh', providerSessionId: token, ip: null, userAgent: null });
    expect((await logout(token)).statusCode).toBe(200);
    expect(await prisma.loginSession.count({ where: { userId: owner, revokedAt: null } })).toBe(0);
  });
});
