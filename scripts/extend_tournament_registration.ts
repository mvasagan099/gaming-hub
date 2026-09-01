import { prisma } from '@gaming-hub/db';

// The 50 current REGISTRATION_OPEN tournaments have registrationEndsAt in the past
// (they were created for the 09:00 UTC slot, registration closed at 09:55 UTC).
// Push registrationEndsAt to 55 minutes from now so they're properly "open" for
// the user to see and join.
async function extendRegistration() {
  const now = new Date();
  const newEndsAt = new Date(now.getTime() + 55 * 60 * 1000); // +55 minutes
  const newStartTime = new Date(now.getTime() + 60 * 60 * 1000); // +60 minutes

  const result = await prisma.tournament.updateMany({
    where: { status: 'REGISTRATION_OPEN' },
    data: {
      registrationEndsAt: newEndsAt,
      startTime: newStartTime,
    },
  });

  console.log(`Updated ${result.count} tournaments:`);
  console.log(`  registrationEndsAt → ${newEndsAt.toISOString()} (in 55 min)`);
  console.log(`  startTime          → ${newStartTime.toISOString()} (in 60 min)`);

  // Also update the schedule log slot hours to match current slot
  // so the scheduler doesn't try to re-create them
  const count = await prisma.tournament.count({ where: { status: 'REGISTRATION_OPEN' } });
  console.log(`\nTotal REGISTRATION_OPEN: ${count}`);

  await prisma.$disconnect();
}

void extendRegistration();
