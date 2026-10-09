import { createHash } from 'node:crypto';
import { prisma, type Prisma } from '@gaming-hub/db';

/** Serialize legacy lookups and protect new event identities with the notification's existing PK. */
export async function persistNotification(data: Prisma.AppNotificationUncheckedCreateInput,
  identity?: string, legacyWhere?: Prisma.AppNotificationWhereInput) {
  if (!identity) return { notification: await prisma.appNotification.create({ data }), created: true };
  const hash = createHash('sha256').update(identity).digest('hex');
  const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identity}))`;
    const existing = await tx.appNotification.findUnique({ where: { id } }) ??
      (legacyWhere ? await tx.appNotification.findFirst({ where: legacyWhere }) : null);
    if (existing) return { notification: existing, created: false };
    return { notification: await tx.appNotification.create({ data: { ...data, id } }), created: true };
  });
}
