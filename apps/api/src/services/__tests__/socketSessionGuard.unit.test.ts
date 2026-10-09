import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installSessionGuard, evictPreviousSessions } from '../../../../socket-server/src/sessionGuard';
describe('connected socket authorization lifecycle', () => {
  let middleware: (packet: any[], next: any) => void;
  let disconnect: () => void;
  let socket: any;
  const user = { userId: 'owner', username: 'owner', displayName: 'Owner', avatarUrl: null, role: 'ADMIN', tokenHash: 'current' };
  beforeEach(() => {
    vi.useFakeTimers();
    user.role = 'ADMIN';
    socket = { id: 'local', data: { tokenHash: 'current' }, use: vi.fn(fn => { middleware = fn; }), once: vi.fn((_event, fn) => { disconnect = fn; }), emit: vi.fn(), leave: vi.fn(), join: vi.fn(), disconnect: vi.fn(() => disconnect?.()) };
  });
  afterEach(() => vi.useRealTimers());
  it('blocks privileged packets immediately after revocation', async () => {
    const verify = vi.fn().mockRejectedValue(new Error('SESSION_REVOKED'));
    installSessionGuard(socket, user, verify);
    const next = vi.fn(), ack = vi.fn();
    middleware(['room:create', {}, ack], next);
    await vi.advanceTimersByTimeAsync(0);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('removes demoted administrators from analytics and updates captured authority', async () => {
    installSessionGuard(socket, user, async () => ({ ...user, role: 'USER' }));
    const next = vi.fn();
    middleware(['admin:analytics:subscribe', {}, vi.fn()], next);
    await vi.advanceTimersByTimeAsync(0);
    expect(user.role).toBe('USER');
    expect(socket.leave).toHaveBeenCalledWith('admin:analytics');
    expect(next).toHaveBeenCalledWith();
    disconnect();
  });
  it('periodically disconnects revoked idle sockets, then stops checking', async () => {
    const verify = vi.fn().mockRejectedValue(new Error('ACCOUNT_BANNED'));
    installSessionGuard(socket, user, verify);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(verify).toHaveBeenCalledOnce();
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('disconnects on stalled authorization rather than allowing an unbounded wait', async () => {
    const verify = vi.fn(() => new Promise<any>(() => {}));
    installSessionGuard(socket, user, verify);
    middleware(['room:create', {}, vi.fn()], vi.fn());
    await vi.advanceTimersByTimeAsync(2_001);
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('coalesces input validation and bounds packets waiting on a DB check', async () => {
    const verify = vi.fn(() => new Promise<any>(() => {}));
    installSessionGuard(socket, user, verify);
    const next = vi.fn();
    for (let i = 0; i < 100; i++) middleware(['room:create', {}, vi.fn()], next);
    expect(verify).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledTimes(36);
    disconnect();
    await vi.advanceTimersByTimeAsync(2_001);
  });
  it('evicts old credentials on remote replicas through the socket adapter', async () => {
    const old = { id: 'remote', data: { tokenHash: 'old' }, emit: vi.fn(), disconnect: vi.fn() };
    const same = { id: 'same-token', data: { tokenHash: 'current' }, emit: vi.fn(), disconnect: vi.fn() };
    const io: any = { in: vi.fn(() => ({ fetchSockets: async () => [old, same] })) };
    await evictPreviousSessions(io, socket, user);
    expect(io.in).toHaveBeenCalledWith('user:owner');
    expect(old.disconnect).toHaveBeenCalledWith(true);
    expect(old.emit).toHaveBeenCalledWith('auth:session-revoked', { reason: 'NEW_LOGIN' });
    expect(same.disconnect).not.toHaveBeenCalled();
  });
  it('requests reauthentication rather than logout for the same verified provider session', async () => {
    const refreshedUser = { ...user, providerSessionId: 'provider-session' };
    const old = { id: 'remote', data: { tokenHash: 'old', user: { providerSessionId: 'provider-session' } }, emit: vi.fn(), disconnect: vi.fn() };
    const io: any = { in: vi.fn(() => ({ fetchSockets: async () => [old] })) };
    await evictPreviousSessions(io, socket, refreshedUser);
    expect(old.emit).toHaveBeenCalledWith('auth:session-revoked', { reason: 'TOKEN_REFRESH' });
    expect(old.disconnect).toHaveBeenCalledWith(true);
  });
});
