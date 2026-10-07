import { expect, it } from 'vitest';
import { prisma } from '@gaming-hub/db';
import { migrationPreflight } from '../../../../../scripts/migration-preflight';
import { createTestUser } from '../../../test/helpers';

it('read-only preflight detects legacy paid matches and conflicting active participants without modifying records', async () => {
  const player = await createTestUser();
  await prisma.match.create({ data: { gameId: 'ludo', stake: 100, status: 'ACTIVE', players: { create: { userId: player.id, seat: 0 } } } });
  await prisma.match.create({ data: { gameId: 'chess', stake: 100, status: 'ACTIVE', players: { create: { userId: player.id, seat: 0 } } } });
  const before = await prisma.match.findMany({ include: { players: true }, orderBy: { id: 'asc' } });
  const report = await migrationPreflight(prisma);
  expect(report.mode).toBe('READ_ONLY');
  expect(report.verdict).toBe('MANUAL_RECONCILIATION_REQUIRED');
  expect(report.findings.legacyLiveMatches).toHaveLength(1);
  expect(report.findings.duplicateParticipants).toHaveLength(1);
  expect(await prisma.match.findMany({ include: { players: true }, orderBy: { id: 'asc' } })).toEqual(before);
});
