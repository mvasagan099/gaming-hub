import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), verifySession: vi.fn() }));
vi.mock('../supabase', () => ({ supabase: { auth: mocked } }));
vi.mock('../../store/authStore', () => ({ useAuthStore: { getState: () => mocked } }));
import { recoverSocketSession } from './sessionRecovery';
describe('socket refresh versus revocation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked.getSession.mockResolvedValue({ data: { session: { access_token: 'new-token' } }, error: null });
    mocked.refreshSession.mockResolvedValue({ data: { session: { access_token: 'new-token' } }, error: null });
    mocked.verifySession.mockResolvedValue('authenticated');
  });
  it('reauthenticates after proven provider token refresh', async () => {
    expect(await recoverSocketSession('TOKEN_REFRESH')).toBe('reconnect');
    expect(mocked.verifySession).toHaveBeenCalledWith({ access_token: 'new-token' });
  });
  it('refreshes an expired credential before reconnecting', async () => {
    expect(await recoverSocketSession('TOKEN_EXPIRED')).toBe('reconnect');
    expect(mocked.refreshSession).toHaveBeenCalledOnce();
  });
  it('retains a pending MFA challenge instead of treating it as logout', async () => {
    mocked.verifySession.mockResolvedValue('mfa_pending');
    expect(await recoverSocketSession('MFA_PENDING')).toBe('mfa_pending');
  });
  it('never retries a genuinely revoked login', async () => {
    expect(await recoverSocketSession('SESSION_INVALID')).toBe('revoked');
    expect(mocked.verifySession).not.toHaveBeenCalled();
  });
  it('a failed backend verification cannot reestablish a socket', async () => {
    mocked.verifySession.mockRejectedValue(new Error('503'));
    expect(await recoverSocketSession('TOKEN_REFRESH')).toBe('revoked');
  });
});
