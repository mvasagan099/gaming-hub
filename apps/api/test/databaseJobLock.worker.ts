import { withDatabaseJobLock } from '../src/services/databaseJobLock';

try {
  await withDatabaseJobLock(process.argv[2], async () => {
    process.send?.({ event: 'holding' });
    await new Promise<void>(resolve => process.once('message', () => resolve()));
  });
  process.send?.({ event: 'released' });
} catch (error) {
  process.send?.({ event: 'rejected', code: (error as { code?: string }).code });
} finally { process.disconnect?.(); }
