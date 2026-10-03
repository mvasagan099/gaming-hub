import { PrismaClient } from '@gaming-hub/db';
import { AppError } from '@gaming-hub/shared';

/** A dedicated one-connection pool owns the session lock for its entire job.
 * DATABASE_LOCK_URL must be a direct/session PostgreSQL URL if the normal URL
 * uses a transaction pooler. Never acquire/release these on the shared pool.
 */
export async function withDatabaseJobLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const value = process.env.DATABASE_LOCK_URL || process.env.DATABASE_URL;
  if (!value) throw new Error('Database job locking requires an explicit database URL');
  const url = new URL(value);
  if (url.searchParams.get('pgbouncer') === 'true') {
    throw new Error('Database job locking requires a direct/session connection in DATABASE_LOCK_URL');
  }
  url.searchParams.set('connection_limit', '1');
  const client = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  let acquired = false;
  try {
    const [row] = await client.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_lock(hashtext(${key})) AS acquired
    `;
    acquired = row?.acquired === true;
    if (!acquired) throw new AppError('INVALID_ACTION', 'This job is already running on another instance', 409);
    return await work();
  } finally {
    // Closing the dedicated pool also releases locks if work/unlock fails.
    try {
      if (acquired) {
        const [row] = await client.$queryRaw<Array<{ released: boolean }>>`
          SELECT pg_advisory_unlock(hashtext(${key})) AS released
        `;
        if (!row?.released) throw new Error('Database job lock session was lost; job needs reconciliation');
      }
    } finally { await client.$disconnect(); }
  }
}
