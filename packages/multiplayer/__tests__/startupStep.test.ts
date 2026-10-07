import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import { runStartupStep } from '../../../apps/socket-server/src/startupStep';
import { PostgresMatchStore } from '../../../apps/socket-server/src/distributed/store';

describe('socket startup diagnostics', () => {
  it('preserves the failed prerequisite and serializes the Error message', async () => {
    const lines: string[] = [];
    const logger = pino({}, { write: (line: string) => { lines.push(line); } });
    const failure = new Error('DURABLE_MATCH_SCHEMA_REQUIRED');
    await expect(runStartupStep('durable_room_schema', async () => { throw failure; }, logger)).rejects.toBe(failure);
    const record = JSON.parse(lines[0]!);
    expect(record.startupStage).toBe('durable_room_schema');
    expect(record.err.message).toBe('DURABLE_MATCH_SCHEMA_REQUIRED');
    expect(record.err.stack).toContain('DURABLE_MATCH_SCHEMA_REQUIRED');
  });

  it('returns successful prerequisite results without logging a failure', async () => {
    const logger = { error: vi.fn() };
    await expect(runStartupStep('redis', async () => 'ready', logger)).resolves.toBe('ready');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('refuses an unmigrated database with an actionable error', async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([{ ready: false }]) };
    await expect(new PostgresMatchStore(db as never).validateSchema()).rejects.toThrow('DURABLE_MATCH_SCHEMA_REQUIRED: LiveRoomCheckpoint');
  });

  it('accepts a database with the durable prerequisites present', async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([{ ready: true }]) };
    await expect(new PostgresMatchStore(db as never).validateSchema()).resolves.toBeUndefined();
  });
});
