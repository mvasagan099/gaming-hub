import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@gaming-hub/db';
import { authRoutes } from '../../routes/auth';
import { adminRolesRoutes } from '../../routes/adminRoles';
import { adminRoutes } from '../../routes/admin';
import { recordLoginSession, hashToken, revokeCurrentSession } from '../sessions';
import { resetSettingsCache } from '../settings';

describe('PostgreSQL application auth boundaries', () => {
  let app: ReturnType<typeof Fastify>, userId: string, token: string;
  let roleIds: string[] = [];
  const request = (url: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', payload?: any) => app.inject({ url, method, headers: { authorization: `Bearer ${token}` }, payload });
  beforeEach(async () => {
    userId = randomUUID(); token = `test.${userId}`; roleIds = [];
    await prisma.user.create({ data: { id: userId, email: `${userId}@test.local`, username: `auth_${userId}`, displayName: 'Auth fixture', role: 'ADMIN', profile: { create: { twoFactorEnabled: true } } } });
    await recordLoginSession({ userId, token, ip: '127.0.0.1', userAgent: 'Fixture' });
    await prisma.loginSession.update({ where: { tokenHash: hashToken(token) }, data: { mfaVerifiedAt: new Date() } });
    resetSettingsCache();
    app = Fastify();
    app.setErrorHandler((error: any, _request: any, reply: any) => reply.code(error.statusCode ?? 500).send({ error: { code: error.code, message: error.message } }));
    await app.register(authRoutes); await app.register(adminRolesRoutes); await app.register(adminRoutes);
  });
  afterEach(async () => {
    vi.restoreAllMocks(); await app.close();
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.customRole.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.siteSetting.deleteMany({ where: { key: { in: ['email.smtpPassword', 'email.smtpHost'] } } });
    resetSettingsCache();
  });
  it('route logout denies reuse and session exchange of the captured credential', async () => {
    expect((await request('/api/auth/logout', 'POST')).statusCode).toBe(200);
    expect((await request('/api/auth/me')).statusCode).toBe(401);
    expect((await request('/api/auth/session', 'POST', { token })).statusCode).toBe(401);
    const row = await prisma.loginSession.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    expect(row.revokedAt).not.toBeNull(); expect(row.mfaVerifiedAt).toBeNull();
  });
  it('pending MFA can log out, but cannot access normal protected resources', async () => {
    await prisma.loginSession.update({ where: { tokenHash: hashToken(token) }, data: { mfaVerifiedAt: null } });
    const res = await request('/api/auth/me');
    expect(res.statusCode).toBe(403); expect(res.json().error.code).toBe('MFA_PENDING');
    expect((await request('/api/auth/logout', 'POST')).statusCode).toBe(200);
  });
  it('banned accounts are denied by both protected routes and session exchange', async () => {
    await prisma.playerPenalty.create({ data: { userId, type: 'CHEATING', status: 'ACTIVE', reason: 'Auth fixture' } });
    for (const res of [await request('/api/auth/me'), await request('/api/auth/session', 'POST', { token })]) {
      expect(res.statusCode).toBe(403); expect(res.json().error.code).toBe('ACCOUNT_BANNED');
    }
  });
  it('parallel refresh/logout cannot leave a provider session active', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const providerSessionId = randomUUID(), oldToken = `old_${attempt}_${userId}`;
      await recordLoginSession({ userId, token: oldToken, providerSessionId, ip: null, userAgent: null });
      await prisma.loginSession.update({ where: { tokenHash: hashToken(oldToken) }, data: { mfaVerifiedAt: new Date() } });
      await Promise.allSettled([
        recordLoginSession({ userId, token: `refresh_${attempt}_${userId}`, providerSessionId, ip: null, userAgent: null }),
        revokeCurrentSession(userId, oldToken),
      ]);
      expect(await prisma.loginSession.count({ where: { userId, providerSessionId, revokedAt: null } })).toBe(0);
      await expect(recordLoginSession({ userId, token: `after_logout_${attempt}_${userId}`, providerSessionId, ip: null, userAgent: null })).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    }
  });
  it('logout using an older revoked credential revokes its refreshed lineage', async () => {
    const providerSessionId = randomUUID();
    await prisma.loginSession.update({ where: { tokenHash: hashToken(token) }, data: { providerSessionId } });
    const newerToken = 'refreshed_'+userId;
    await recordLoginSession({ userId, token: newerToken, providerSessionId, ip: null, userAgent: null });
    expect((await request('/api/auth/logout', 'POST')).statusCode).toBe(200);
    expect(await prisma.loginSession.count({ where: { userId, providerSessionId, revokedAt: null } })).toBe(0);
  });
  it('a delegated role cannot escalate itself through the real role route', async () => {
    const role = await prisma.customRole.create({ data: { name: `delegate_${userId}`, displayName: 'Delegate', permissions: { create: [{ permission: 'admin:roles:edit' }] } } });
    roleIds.push(role.id);
    await prisma.user.update({ where: { id: userId }, data: { role: 'CUSTOM', customRoleId: role.id } });
    const res = await request(`/api/admin/roles/${role.id}`, 'PATCH', { permissions: ['admin:roles:edit', 'admin:wallet:adjust'] });
    expect(res.statusCode).toBe(403);
    expect(await prisma.rolePermission.count({ where: { roleId: role.id, permission: 'admin:wallet:adjust' } })).toBe(0);
  });
  it('nested role replacement rolls back metadata and deleted permissions if insertion fails', async () => {
    const role = await prisma.customRole.create({ data: { name: `atomic_${userId}`, displayName: 'Original', permissions: { create: [{ permission: 'admin:roles:view' }] } } });
    roleIds.push(role.id);
    const update = prisma.customRole.update.bind(prisma.customRole);
    // Inject a real PostgreSQL uniqueness failure inside the nested write.
    vi.spyOn(prisma.customRole, 'update').mockImplementationOnce((args: any) => update({ ...args, data: { ...args.data, permissions: { deleteMany: {}, create: [{ permission: 'admin:roles:edit' }, { permission: 'admin:roles:edit' }] } } }) as any);
    expect((await request(`/api/admin/roles/${role.id}`, 'PATCH', { displayName: 'Changed', permissions: ['admin:roles:edit'] })).statusCode).toBe(500);
    const unchanged = await prisma.customRole.findUniqueOrThrow({ where: { id: role.id }, include: { permissions: true } });
    expect(unchanged.displayName).toBe('Original'); expect(unchanged.permissions.map(p => p.permission)).toEqual(['admin:roles:view']);
  });
  it('view settings returns no provider secrets and saving other fields preserves them', async () => {
    await prisma.siteSetting.create({ data: { key: 'email.smtpPassword', category: 'email', value: 'synthetic-secret-marker', secret: true } });
    const read = await request('/api/admin/settings');
    expect(read.statusCode).toBe(200); expect(read.body).not.toContain('synthetic-secret-marker');
    const save = await app.inject({ method: 'PUT', url: '/api/admin/settings/category', headers: { authorization: `Bearer ${token}` }, payload: { category: 'email', values: { smtpHost: 'smtp.test.invalid' } } });
    expect(save.statusCode).toBe(200); expect(save.body).not.toContain('synthetic-secret-marker');
    const saved = await prisma.siteSetting.findUniqueOrThrow({ where: { key: 'email.smtpPassword' } });
    expect(saved.value).toBe('synthetic-secret-marker');
  });
});
