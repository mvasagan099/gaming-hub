import { prisma } from '@gaming-hub/db';
import { scheduleHourlyTournaments } from '../apps/api/src/services/hourlyTournamentScheduler';

async function main() {
  const result = await scheduleHourlyTournaments();
  console.log('Scheduler -> created:', result.created, ' skipped:', result.skipped, ' errors:', result.errors.length);
  if (result.errors.length) console.log('Errors:', result.errors);

  const now = new Date();
  const slot = new Date(now);
  slot.setUTCMinutes(0, 0, 0);

  const logs = await prisma.tournamentTierScheduleLog.findMany({
    where: { slotHour: slot },
    include: { tier: { select: { code: true } } },
  });

  const byTier: Record<string, string[]> = {};
  for (const l of logs) {
    if (!byTier[l.tier.code]) byTier[l.tier.code] = [];
    byTier[l.tier.code]!.push(l.gameId);
  }
  for (const [t, g] of Object.entries(byTier).sort()) {
    console.log(`  ${t.padEnd(10)} -> ${(g as string[]).length} games: ${(g as string[]).sort().join(', ')}`);
  }
  console.log('\nTotal schedule log slots:', logs.length, '(expected 50)');

  const open = await prisma.tournament.count({ where: { status: 'REGISTRATION_OPEN' } });
  console.log('REGISTRATION_OPEN tournaments in DB:', open, '(expected 50+)');

  await prisma.$disconnect();
}

void main();
