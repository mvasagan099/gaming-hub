import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@gaming-hub/db';
import { KycLevel, KycStatus } from '@gaming-hub/shared';
import { buildApp } from '../../app';
import { createTestUser } from '../../../test/helpers';
import { createKycRequest, submitKycRequest, approveKycRequest, adminOverrideKycLevel } from '../kyc';
import { PlayerProfileService } from '../playerProfileService';
import { updateUserProfile, ensureUser } from '../users';

const app = buildApp();
afterAll(async () => app.close());
let user: Awaited<ReturnType<typeof createTestUser>>;
beforeEach(async () => {
  user = await createTestUser();
  await prisma.profile.update({ where: { userId: user.id }, data: { country: 'IN' } });
});
const patch = (payload: Record<string, unknown>) => app.inject({ method: 'PATCH', url: '/api/users/me',
  headers: { authorization: `Bearer ${user.token}` }, payload });

describe('registration country is permanent', () => {
  it('rejects a direct API country change before changing name or privacy', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const privacy = await PlayerProfileService.getProfilePrivacy(user.id);
    const response = await patch({ country: 'US', displayName: 'Changed', isPrivate: !privacy });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toContain('registration');
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } })).country).toBe('IN');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).displayName).toBe(before.displayName);
    expect(await PlayerProfileService.getProfilePrivacy(user.id)).toBe(privacy);
  });

  it.each(['', '  ', null])('rejects clearing country with %j', async country => {
    expect((await patch({ country })).statusCode).toBe(country === null ? 422 : 400);
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } })).country).toBe('IN');
  });

  it('allows old clients to echo the same country while editing other fields', async () => {
    const response = await patch({ country: 'IN', displayName: 'Updated name', city: 'Chennai' });
    expect(response.statusCode).toBe(200);
    expect(response.json().profile.country).toBe('IN');
    expect(response.json().profile.city).toBe('Chennai');
    expect(response.json().user.displayName).toBe('Updated name');
  });

  it('allows normal profile edits without country', async () => {
    const response = await patch({ bio: 'New bio', phone: '1234567890' });
    expect(response.statusCode).toBe(200);
    expect(response.json().profile.country).toBe('IN');
    expect(response.json().profile.bio).toBe('New bio');
  });

  it('does not allow a legacy account with no country to assign one through profile editing', async () => {
    await prisma.profile.update({ where: { userId: user.id }, data: { country: null } });
    await expect(updateUserProfile(user.id, { country: 'US' })).rejects.toThrow(/permanent/);
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } })).country).toBeNull();
  });

  it('rejects a KYC country change without creating a request', async () => {
    await expect(createKycRequest({ userId: user.id, level: KycLevel.LEVEL_1, country: 'US', fullName: 'Test',
      mobileNumber: '1234567890', dateOfBirth: new Date('1990-01-01') })).rejects.toThrow(/registration/);
    expect(await prisma.kycRequest.findUnique({ where: { userId: user.id } })).toBeNull();
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } })).country).toBe('IN');
  });

  it('preserves registered country when approving an older KYC request with a different country', async () => {
    const request = await prisma.kycRequest.create({ data: { userId: user.id, country: 'US',
      level: KycLevel.LEVEL_1, status: KycStatus.NOT_STARTED, fullName: 'Test', mobileNumber: '1234567890' } });
    // Historical country mismatch is intentional; approval still needs valid submitted evidence.
    for (const documentType of ['PASSPORT', 'SELFIE'] as const) await prisma.kycDocument.create({ data: {
      requestId: request.id, documentType, isSelfie: documentType === 'SELFIE', fileName: documentType+'.png',
      fileUrl: user.id+'/'+documentType+'.png', fileSize: 100, mimeType: 'image/png', fileHash: 'fixture-'+documentType,
    } });
    await submitKycRequest(request.id, user.id);
    await approveKycRequest(request.id, user.id, 'Test approval');
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(profile.country).toBe('IN');
    expect(profile.kycStatus).toBe('approved');
  });
  it('does not reassign country from changed authentication metadata on a later login', async () => {
    await ensureUser(user.id, `${user.id}@test.local`, { country: 'US' });
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } })).country).toBe('IN');
  });

  it('preserves registered country through the administrative KYC approval path', async () => {
    const request = await prisma.kycRequest.create({ data: { userId: user.id, country: 'US',
      level: KycLevel.LEVEL_1, status: KycStatus.PENDING, fullName: 'Test', mobileNumber: '1234567890' } });
    await adminOverrideKycLevel(request.id, user.id, KycLevel.LEVEL_2, 'Test approval');
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } })).country).toBe('IN');
  });

});
