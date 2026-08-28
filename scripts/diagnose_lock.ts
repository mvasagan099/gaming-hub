import { prisma } from '@gaming-hub/db';

async function diagnose() {
  // 1. Check advisory locks in PG
  const locks = await prisma.$queryRaw<any[]>`
    SELECT pid, locktype, classid, objid, granted
    FROM pg_locks WHERE locktype = 'advisory'
  `;
  console.log('Advisory locks in PG:', JSON.stringify(locks, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

  // 2. Release all stuck advisory locks — must cast void to text to avoid Prisma deserialization error
  await prisma.$queryRaw<any[]>`
    SELECT pg_advisory_unlock_all()::text as result
  `;
  console.log('Released all advisory locks for this session');

  // 3. Check advisory locks again - should now be empty
  const locksAfter = await prisma.$queryRaw<any[]>`
    SELECT pid, locktype, classid, objid, granted
    FROM pg_locks WHERE locktype = 'advisory'
  `;
  console.log('Advisory locks AFTER unlock:', JSON.stringify(locksAfter, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

  // 4. Count tournaments by status
  const byStatus = await prisma.$queryRaw<any[]>`
    SELECT status, COUNT(*)::int as count FROM "Tournament" GROUP BY status ORDER BY count DESC
  `;
  console.log('\nTournaments by status:', JSON.stringify(byStatus, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

  // 5. Sample recent REGISTRATION_OPEN
  const sample = await prisma.tournament.findMany({
    where: { status: 'REGISTRATION_OPEN' },
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      gameId: true,
      entryFee: true,
      status: true,
      startTime: true,
      registrationEndsAt: true,
    },
  });
  console.log('\nLatest REGISTRATION_OPEN (5):');
  for (const t of sample) {
    console.log(` - ${t.title} | ${t.gameId} | regEnds: ${t.registrationEndsAt?.toISOString()} | starts: ${t.startTime?.toISOString()}`);
  }

  await prisma.$disconnect();
}

void diagnose();
