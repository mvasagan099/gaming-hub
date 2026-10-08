import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@gaming-hub/db';
import { GAME_IDS, DEFAULT_TOURNAMENT_TIERS } from '@gaming-hub/shared';
import { buildApp } from '../../app';
import { createTestUser } from '../../../test/helpers';
import { resetTestDatabase } from '../../../test/db';
import { hashToken } from '../sessions';
import { createTournament, updateTournament } from '../tournaments';
import { scheduleHourlyTournaments, setHourlySchedulerPaused } from '../hourlyTournamentScheduler';
const app = buildApp();
beforeAll(async () => { await app.ready(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetTestDatabase(); });
const configuration = () => ({ gameId: 'snooker', title: 'Exceptional Championship', entryFee: 25, prizePool: 10000,
  minPlayers: 2, maxPlayers: 500, startTime: new Date(Date.now() + 3600000).toISOString(), registrationEndsAt: null });
async function admin() {
  const user = await createTestUser({ role: 'ADMIN' });
  await prisma.profile.update({ where: { userId: user.id }, data: { twoFactorEnabled: true } });
  await prisma.loginSession.create({ data: { userId: user.id, tokenHash: hashToken(user.token), expiresAt: new Date(Date.now()+60000), mfaVerifiedAt: new Date() } });
  return user;
}
describe('production tournament creation and scheduling', () => {
  it('accepts the actual exceptional form defaults with an empty optional date normalized to null', async () => {
    const user = await admin();
    const response = await app.inject({ method: 'POST', url: '/api/admin/tournaments', headers: { authorization: `Bearer ${user.token}` }, payload: configuration() });
    expect(response.statusCode).toBe(200);
    expect(response.json().tournament).toMatchObject({ minPlayers: 2, maxPlayers: 500, registrationEndsAt: null, status: 'DRAFT' });
  });
  it('returns all persisted creation and update fields', async () => {
    const user = await admin();
    const input = { ...configuration(), minPlayers: 8, autoStartWhenFull: true, registrationEndsAt: new Date(Date.now()+1800000).toISOString(), prizeDistribution: [{ rank: 1, percentage: 100 }] };
    const response = await app.inject({ method: 'POST', url: '/api/admin/tournaments', headers: { authorization: `Bearer ${user.token}` }, payload: input });
    expect(response.statusCode).toBe(200);
    expect(response.json().tournament).toMatchObject({ minPlayers: 8, autoStartWhenFull: true, registrationEndsAt: input.registrationEndsAt, prizeDistribution: input.prizeDistribution });
    const patched = await app.inject({ method: 'PATCH', url: `/api/admin/tournaments/${response.json().tournament.id}`, headers: { authorization: `Bearer ${user.token}` }, payload: { minPlayers: 10, registrationEndsAt: null } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().tournament).toMatchObject({ minPlayers: 10, registrationEndsAt: null });
  });
  it.each([
    { minPlayers: 20, maxPlayers: 10 },
    { registrationEndsAt: new Date(Date.now()+7200000).toISOString() },
    { registrationStartsAt: new Date(Date.now()+1800000).toISOString(), registrationEndsAt: new Date(Date.now()+900000).toISOString() },
  ])('rejects inconsistent configuration before writing: %j', async override => {
    await expect(createTournament({ ...configuration(), ...override }, null)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await prisma.tournament.count()).toBe(0);
  });
  it('rejects an invalid edit without partial mutation', async () => {
    const tournament = await createTournament(configuration(), null);
    await expect(updateTournament(tournament.id, { title: 'Partial mutation', maxPlayers: 1 }, null)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } })).title).toBe(tournament.title);
  });
  it('bootstraps empty tier configuration and schedules all game tiers exactly once', async () => {
    setHourlySchedulerPaused(false);
    expect(await prisma.tournamentTier.count()).toBe(0);
    const first = await scheduleHourlyTournaments();
    expect(first.errors).toEqual([]);
    expect(first.created).toBe(GAME_IDS.length * DEFAULT_TOURNAMENT_TIERS.length);
    expect((await scheduleHourlyTournaments()).created).toBe(0);
    expect(await prisma.tournament.count({ where: { status: 'REGISTRATION_OPEN' } })).toBe(first.created);
  });
  it('bootstraps safely when multiple scheduler replicas start together', async () => {
    setHourlySchedulerPaused(false);
    const results = await Promise.all(Array.from({ length: 3 }, () => scheduleHourlyTournaments()));
    expect(results.flatMap(result => result.errors)).toEqual([]);
    expect(await prisma.tournamentTier.count()).toBe(DEFAULT_TOURNAMENT_TIERS.length);
    expect(await prisma.tournament.count()).toBe(GAME_IDS.length * DEFAULT_TOURNAMENT_TIERS.length);
  });
  it('preserves existing disabled tiers', async () => {
    const { minPlayers: _minPlayers, ...tier } = DEFAULT_TOURNAMENT_TIERS[0];
    await prisma.tournamentTier.create({ data: { ...tier, isActive: false, prizeDistribution: [] } });
    expect((await scheduleHourlyTournaments()).created).toBe(0);
    expect(await prisma.tournamentTier.count()).toBe(1);
    expect((await prisma.tournamentTier.findFirstOrThrow()).isActive).toBe(false);
  });
});
