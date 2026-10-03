import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@gaming-hub/db';
import { resetTestDatabase } from '../../../test/db';
import { buildSingleEliminationBracket, transitionTournamentStatus } from '../tournamentEngine';
import { withDatabaseJobLock } from '../databaseJobLock';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

beforeEach(async () => { await resetTestDatabase(); });

async function tournament() {
  const t = await prisma.tournament.create({ data: {
    title: 'Lifecycle race fixture', description: 'Disposable lifecycle test', gameId: 'chess', format: 'SINGLE_ELIMINATION',
    status: 'REGISTRATION_OPEN', entryFee: 0, prizePool: 0,
    minPlayers: 2, maxPlayers: 2, startTime: new Date(),
  }});
  for (let i=0; i<2; i++) {
    const user=await prisma.user.create({ data: { id: `${t.id}-${i}`, username: `${t.id}-${i}`, displayName: `Player ${i}` }});
    await prisma.tournamentPlayer.create({ data: { tournamentId: t.id, userId: user.id }});
  }
  return t;
}

describe('Tournament lifecycle concurrency', () => {
  it('independent processes cannot own one database job lock concurrently', async () => {
    const children: ChildProcess[] = [];
    const key = 'test:independent-job-workers';
    const start = () => {
      const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../../../test/databaseJobLock.worker.ts', import.meta.url)), key], {
        env: { ...process.env, DATABASE_LOCK_URL: process.env.TEST_DATABASE_URL }, stdio: ['ignore','ignore','pipe','ipc'],
      });
      children.push(child);
      return child;
    };
    const message = (child: ChildProcess) => new Promise<{event:string;code?:string}>((resolve,reject)=>{
      child.once('message', value => resolve(value as {event:string;code?:string}));
      child.once('error', reject);
      child.once('exit', code => { if (code) reject(new Error(`Lock worker exited ${code}`)); });
    });
    try {
      const first = start(); expect(await message(first)).toMatchObject({event:'holding'});
      const competitor = start(); expect(await message(competitor)).toMatchObject({event:'rejected',code:'INVALID_ACTION'});
      const released = message(first); first.send('release'); expect(await released).toMatchObject({event:'released'});
      await expect(withDatabaseJobLock(key, async()=>true)).resolves.toBe(true);
    } finally { for (const child of children) if (!child.killed) child.kill(); }
  });

  it('releases the dedicated lock after a failed job', async () => {
    await expect(withDatabaseJobLock('test:failed-job', async()=>{throw new Error('controlled failure');})).rejects.toThrow('controlled failure');
    await expect(withDatabaseJobLock('test:failed-job', async()=>true)).resolves.toBe(true);
  });

  it('only one competing request can claim the STARTING transition', async () => {
    const t=await tournament();
    const outcomes=await Promise.allSettled(Array.from({length: 8}, () => transitionTournamentStatus(t.id, 'STARTING')));
    expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect((await prisma.tournament.findUniqueOrThrow({where:{id:t.id}})).stateVersion).toBe(t.stateVersion+1);
  });

  it('cannot delete an active bracket when asked to rebuild it', async () => {
    const t=await tournament();
    const slot=await prisma.tournamentRound.create({data:{tournamentId:t.id,roundNumber:1,matchNumber:1,status:'IN_PROGRESS'}});
    await expect(buildSingleEliminationBracket(t.id)).rejects.toMatchObject({code:'INVALID_ACTION'});
    expect(await prisma.tournamentRound.findUnique({where:{id:slot.id}})).not.toBeNull();
  });
});
