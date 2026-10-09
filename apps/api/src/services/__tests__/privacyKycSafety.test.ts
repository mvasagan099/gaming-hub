import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@gaming-hub/db';
import { createTestUser } from '../../../test/helpers';
import { recordLoginSession } from '../sessions';
import { updatePrivacySettings } from '../privacyService';
import { PlayerProfileService } from '../playerProfileService';
import { SearchService } from '../search';
import { friendsRoutes } from '../../routes/friends';
import { createNotification } from '../notifications';
import { NotificationService } from '../notificationService';
import { approveKycRequest, deleteKycDocument, submitKycRequest, createKycRequest, uploadKycDocument, rejectKycRequest } from '../kyc';
import { SupabaseStorageService, supabaseAdmin } from '../supabaseStorage';
import { FileUploadService } from '../fileUpload';
import { sendRoomInvitation } from '../roomInvitations';
import { usersRoutes } from '../../routes/users';
import { accountRoutes } from '../../routes/account';
import { hashToken } from '../sessions';

describe('PostgreSQL privacy and KYC review boundaries', () => {
  let owner: Awaited<ReturnType<typeof createTestUser>>, viewer: Awaited<ReturnType<typeof createTestUser>>;
  let app: ReturnType<typeof Fastify> | undefined;
  let ownerUsername: string;
  beforeEach(async () => {
    owner = await createTestUser(); viewer = await createTestUser();
    ownerUsername = (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).username;
    await prisma.profile.update({ where: { userId: owner.id }, data: { bio: 'Private biography', xp: 250, wins: 12, coins: 450, gems: 40 } });
    await prisma.user.update({ where: { id: owner.id }, data: { isOnline: true, lastSeenAt: new Date() } });
  });
  afterEach(async () => { vi.restoreAllMocks(); await app?.close(); app = undefined; });
  async function friendship() { return prisma.friend.create({ data: { requesterId: owner.id, addresseeId: viewer.id, status: 'ACCEPTED' } }); }
  async function friendsApp() {
    await recordLoginSession({ userId: viewer.id, token: viewer.token, ip: null, userAgent: null });
    app = Fastify(); app.setErrorHandler((e: any, _r: any, reply: any) => reply.code(e.statusCode ?? 500).send({ error: { code: e.code } }));
    await app.register(friendsRoutes);
    return app;
  }
  async function kyc(status: 'NOT_STARTED' | 'PENDING' | 'UNDER_REVIEW' = 'NOT_STARTED') {
    return prisma.kycRequest.create({ data: { userId: owner.id, level: 'LEVEL_2', status, country: 'US', fullName: 'Fixture', mobileNumber: '5555555555' } });
  }
  async function documents(requestId: string) {
    for (const type of ['PASSPORT', 'SELFIE'] as const) await prisma.kycDocument.create({ data: {
      requestId, documentType: type, isSelfie: type === 'SELFIE', fileName: type+'.png', fileUrl: owner.id+'/'+randomUUID()+'.png',
      fileSize: 100, mimeType: 'image/png', fileHash: 'hash-'+type,
    } });
  }
  it('friends-only search masks statistics and presence for a nonfriend', async () => {
    await updatePrivacySettings(owner.id, { profileVisibility: 'FRIENDS' });
    const found = (await SearchService.searchPlayers(ownerUsername, 20, viewer.id))[0]!;
    expect(found).toMatchObject({ xp: 0, level: 0, wins: 0, globalRating: 0, isOnline: false });
    await friendship();
    expect((await SearchService.searchPlayers(ownerUsername, 20, viewer.id))[0]).toMatchObject({ xp: 250, wins: 12 });
  });
  it('private profile does not disclose biography, country, XP or presence', async () => {
    await updatePrivacySettings(owner.id, { profileVisibility: 'NOBODY' });
    expect(await PlayerProfileService.getPublicProfile(owner.id, viewer.id)).toMatchObject({ bio: null, country: null, xp: 0, level: 0, isOnline: false, lastSeenAt: null });
    expect((await PlayerProfileService.getPublicProfile(owner.id, owner.id)).bio).toBe('Private biography');
  });
  it('friend serializer respects hidden stats and never exposes wallet counters', async () => {
    await friendship(); await updatePrivacySettings(owner.id, { showStats: false });
    const a = await friendsApp();
    const response = await a.inject({ method: 'GET', url: '/api/friends', headers: { authorization: 'Bearer '+viewer.token } });
    expect(response.statusCode).toBe(200);
    expect(response.json()[0].friend).toMatchObject({ coins: 0, gems: 0, xp: 0, wins: 0 });
  });
  it('deleted accounts cannot be viewed even through direct public lookup', async () => {
    await prisma.user.update({ where: { id: owner.id }, data: { deletedAt: new Date() } });
    await expect(PlayerProfileService.getPublicProfile(owner.id, viewer.id, true)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('string false is rejected without altering persisted privacy', async () => {
    await expect(updatePrivacySettings(owner.id, { showStats: 'false' } as any)).rejects.toThrow();
    expect(await prisma.userPrivacy.findUnique({ where: { userId: owner.id } })).toBeNull();
  });
  it('blocked accounts cannot send a friend request', async () => {
    await prisma.blockedUser.create({ data: { blockerId: owner.id, blockedId: viewer.id } });
    const a = await friendsApp();
    const r = await a.inject({ method: 'POST', url: '/api/friends/request', headers: { authorization: 'Bearer '+viewer.token }, payload: { username: ownerUsername } });
    expect(r.statusCode).toBe(403);
    expect(await prisma.friend.count({ where: { requesterId: viewer.id, addresseeId: owner.id } })).toBe(0);
  });
  it('disabled game invitations are enforced before creating a notification', async () => {
    await friendship(); await updatePrivacySettings(viewer.id, { allowGameInvites: false });
    const room = await prisma.room.create({ data: { code: randomUUID().slice(0,6), gameId: 'chess', hostId: owner.id, isPrivate: true, stake: 0, minPlayers: 2, maxPlayers: 2, players: { create: { userId: owner.id } } } });
    await expect(sendRoomInvitation(owner.id, viewer.id, room.id)).rejects.toMatchObject({ statusCode: 403 });
  });
  it('concurrent event notification creation yields one persisted row', async () => {
    const eventId = randomUUID();
    const rows = await Promise.all(Array.from({ length: 8 }, () => createNotification(owner.id, 'SYSTEM', 'Fixture', 'Fixture', {}, { eventId })));
    expect(new Set(rows.map(r => r.id)).size).toBe(1);
  });
  it('concurrent financial notification retries emit exactly once', async () => {
    const emitted = vi.fn(); const remove = NotificationService.registerListener(emitted);
    try {
      const rows = await Promise.all(Array.from({ length: 6 }, () => NotificationService.notifyWinning(owner.id, randomReference, 'chess', 50)));
      expect(new Set(rows.map(r => r.id)).size).toBe(1); expect(emitted).toHaveBeenCalledTimes(1);
    } finally { remove(); }
  });
  const randomReference = randomUUID();
  it('approval cannot approve a pending request without documents', async () => {
    const r = await kyc('PENDING');
    await expect(approveKycRequest(r.id, viewer.id)).rejects.toMatchObject({ statusCode: 400 });
    expect((await prisma.kycRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('PENDING');
  });
  it('pending review documents cannot be deleted', async () => {
    const r = await kyc(); await documents(r.id); await submitKycRequest(r.id, owner.id);
    const d = await prisma.kycDocument.findFirstOrThrow({ where: { requestId: r.id } });
    const remove = vi.spyOn(FileUploadService, 'delete').mockResolvedValue(undefined);
    await expect(deleteKycDocument(r.id, d.id, owner.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(remove).not.toHaveBeenCalled();
  });
  it('reinitialization cannot unlock a request under review', async () => {
    await kyc('UNDER_REVIEW');
    await expect(createKycRequest({ userId: owner.id, level: 'LEVEL_2' as any, fullName: 'Changed', dateOfBirth: new Date('1990-01-01'), country: 'US', mobileNumber: '5555555555' })).rejects.toMatchObject({ statusCode: 409 });
  });
  it('submission enforces configured mandatory documents', async () => {
    const r = await kyc(); await documents(r.id);
    await prisma.kycDocumentConfig.upsert({ where: { country_documentType: { country: 'US', documentType: 'NATIONAL_ID' } }, create: { country: 'US', documentType: 'NATIONAL_ID', isRequired: true, requiresBack: true }, update: { isRequired: true, requiresBack: true } });
    await expect(submitKycRequest(r.id, owner.id)).rejects.toMatchObject({ statusCode: 400 });
    await prisma.kycDocumentConfig.deleteMany({ where: { country: 'US', documentType: 'NATIONAL_ID' } });
  });
  it('storage uploads use unique immutable paths across document types and retries', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    vi.spyOn(supabaseAdmin.storage, 'listBuckets').mockResolvedValue({ data: [{ name: 'kyc_upload', public: false }], error: null } as any);
    vi.spyOn(supabaseAdmin.storage, 'from').mockReturnValue({ upload } as any);
    for (const type of ['PASSPORT', 'DRIVING_LICENCE', 'PASSPORT']) await SupabaseStorageService.upload(owner.id, Buffer.from('fixture'), 'id.png', 'image/png', 'front', false, type);
    expect(new Set(upload.mock.calls.map(c => c[0])).size).toBe(3);
    expect(upload.mock.calls.every(c => c[2].upsert === false)).toBe(true);
  });
  it('concurrent approval and document deletion preserve the submitted revision', async () => {
    const r = await kyc(); await documents(r.id); await submitKycRequest(r.id, owner.id);
    const d = await prisma.kycDocument.findFirstOrThrow({ where: { requestId: r.id } });
    const results = await Promise.allSettled([approveKycRequest(r.id, viewer.id), deleteKycDocument(r.id, d.id, owner.id)]);
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(await prisma.kycDocument.count({ where: { requestId: r.id, status: 'VERIFIED' } })).toBe(2);
    expect(await prisma.kycReview.count({ where: { requestId: r.id, action: 'APPROVED' } })).toBe(1);
  });
  it('changed submitted metadata cannot be approved', async () => {
    const r = await kyc(); await documents(r.id); await submitKycRequest(r.id, owner.id);
    await prisma.kycDocument.updateMany({ where: { requestId: r.id, documentType: 'PASSPORT' }, data: { fileUrl: 'different-object.png' } });
    await expect(approveKycRequest(r.id, viewer.id)).rejects.toMatchObject({ statusCode: 400 });
    expect((await prisma.kycRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('PENDING');
  });
  it('an upload finishing after submission cannot change the review set', async () => {
    const r = await kyc(); await documents(r.id);
    let finish!: (value: any) => void, started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    vi.spyOn(SupabaseStorageService, 'upload').mockImplementation(async () => { started(); return new Promise(resolve => { finish = resolve; }); });
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
    const uploading = uploadKycDocument({ requestId: r.id, userId: owner.id, documentType: 'PASSPORT' as any, fileBuffer: png, fileName: 'passport.png', mimeType: 'image/png' });
    const rejected = expect(uploading).rejects.toMatchObject({ statusCode: 409 });
    await entered; await submitKycRequest(r.id, owner.id);
    finish({ fileName: 'unique.png', filePath: owner.id+'/unique.png', fileSize: png.length, mimeType: 'image/png' });
    await rejected; await approveKycRequest(r.id, viewer.id);
    expect(await prisma.kycDocument.count({ where: { requestId: r.id } })).toBe(2);
    expect(await prisma.kycAuditLog.count({ where: { requestId: r.id, action: 'DOCUMENT_UPLOAD_NOT_ATTACHED' } })).toBe(1);
  });
  it('resubmission creates a new review revision', async () => {
    const r = await kyc(); await documents(r.id); await submitKycRequest(r.id, owner.id);
    await rejectKycRequest(r.id, viewer.id, 'Please resubmit', true);
    await submitKycRequest(r.id, owner.id);
    const revisions = await prisma.kycAuditLog.findMany({ where: { requestId: r.id, action: 'KYC_SUBMITTED' } });
    expect(revisions).toHaveLength(2);
    expect(new Set(revisions.map(r => (r.metadata as any).revisionId)).size).toBe(2);
  });
  it('front-only licence cannot satisfy a two-sided document requirement', async () => {
    const r = await kyc(); await documents(r.id);
    await prisma.kycDocument.create({ data: { requestId: r.id, documentType: 'DRIVING_LICENCE', side: 'front', fileName: 'front.png', fileUrl: 'unique/front.png', fileSize: 100, fileHash: 'front-hash', mimeType: 'image/png' } });
    await expect(submitKycRequest(r.id, owner.id)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('selfie flag cannot relabel an identity document', async () => {
    const r = await kyc();
    const upload = vi.spyOn(SupabaseStorageService, 'upload');
    await expect(uploadKycDocument({ requestId: r.id, userId: owner.id, documentType: 'PASSPORT' as any, isSelfie: true, fileBuffer: Buffer.from('not-an-image'), fileName: 'selfie.png', mimeType: 'image/png' })).rejects.toMatchObject({ statusCode: 400 });
    expect(upload).not.toHaveBeenCalled();
  });
  it('recreated API instances read the same stored privacy without exposing PII', async () => {
    await updatePrivacySettings(owner.id, { profileVisibility: 'NOBODY' });
    const instances = [Fastify(), Fastify()];
    try {
      for (const a of instances) {
        a.setErrorHandler((e: any, _r, reply) => reply.code(e.statusCode ?? 500).send({ error: e.code }));
        await a.register(usersRoutes);
        const r = await a.inject({ url: `/api/users/${owner.id}/public-profile` });
        expect(r.statusCode).toBe(200); expect(r.json()).toMatchObject({ isPrivate: true, bio: null, xp: 0 });
        for (const key of ['email','phone','streetAddress','passwordHash','twoFactorSecret','twoFactorSecretEncrypted']) expect(r.json()).not.toHaveProperty(key);
      }
    } finally { await Promise.all(instances.map(a => a.close())); }
  });
  it('account deletion removes biography but preserves restricted KYC storage identities', async () => {
    const r = await kyc(); await documents(r.id);
    const before = await prisma.kycDocument.findMany({ where: { requestId: r.id } });
    await prisma.profile.update({ where: { userId: owner.id }, data: { twoFactorEnabled: true } });
    await recordLoginSession({ userId: owner.id, token: owner.token, ip: null, userAgent: null });
    await prisma.loginSession.update({ where: { tokenHash: hashToken(owner.token) }, data: { mfaVerifiedAt: new Date() } });
    app = Fastify(); await app.register(accountRoutes);
    const response = await app.inject({ method: 'DELETE', url: '/api/account', headers: { authorization: 'Bearer '+owner.token } });
    expect(response.statusCode).toBe(200);
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: owner.id } })).bio).toBeNull();
    expect(await prisma.kycDocument.findMany({ where: { requestId: r.id } })).toEqual(before);
    await expect(PlayerProfileService.getPublicProfile(owner.id, viewer.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});
