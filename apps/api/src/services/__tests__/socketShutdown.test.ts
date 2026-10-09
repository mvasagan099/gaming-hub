import { describe, expect, it, vi } from 'vitest';
import { EventEmitter, once } from 'node:events';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createSocketShutdown } from '../../../../socket-server/src/shutdown';

describe('socket server shutdown', () => {
  it('unsubscribes the actual Redis adapter before closing Redis, including repeated signals', async () => {
    const commands: string[] = [];
    class Client extends EventEmitter {
      status = 'ready';
      psubscribe() { return Promise.resolve(); }
      subscribe() { return Promise.resolve(); }
      punsubscribe() { expect(this.status).toBe('ready'); commands.push('punsubscribe'); return Promise.resolve(); }
      unsubscribe() { expect(this.status).toBe('ready'); commands.push('unsubscribe'); return Promise.resolve(); }
      quit() { commands.push('quit'); this.status = 'end'; return Promise.resolve(); }
    }
    const pub = new Client(), sub = new Client();
    const server = createServer();
    const io = new Server(server);
    const listening = once(server, 'listening');
    server.listen(0, '127.0.0.1'); await listening;
    io.adapter(createAdapter(pub as any, sub as any)); io.of('/');
    const stopManagers = vi.fn();
    const shutdown = createSocketShutdown([
      () => new Promise<void>((resolve, reject) => io.close(error => error ? reject(error) : resolve())),
      stopManagers,
      async () => { await Promise.all([pub.quit(), sub.quit()]); },
    ]);
    await Promise.all([shutdown(), shutdown()]);
    expect(commands).toEqual(['punsubscribe', 'unsubscribe', 'quit', 'quit']);
    expect(stopManagers).toHaveBeenCalledOnce();
  });
  it('completes remaining cleanup while reporting failures to the signal handler', async () => {
    const release = vi.fn();
    const shutdown = createSocketShutdown([() => { throw new Error('connection lost'); }, release]);
    await expect(shutdown()).rejects.toThrow('Socket shutdown failed');
    await expect(shutdown()).rejects.toThrow('Socket shutdown failed');
    expect(release).toHaveBeenCalledOnce();
  });
});
