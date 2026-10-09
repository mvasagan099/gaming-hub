import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ getSession: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(), post: vi.fn() }));
vi.mock('../services/supabase', () => ({ supabase: { auth: fixture } }));
vi.mock('../services/api/client', () => ({ apiClient: { post: fixture.post } }));
import { completePasswordRecovery } from './completePasswordRecovery';
beforeEach(() => {
  vi.resetAllMocks();
  fixture.getSession.mockResolvedValue({ data: { session: { access_token: 'recovery-token' } }, error: null });
  fixture.updateUser.mockResolvedValue({ error: null }); fixture.post.mockResolvedValue({ ok: true }); fixture.signOut.mockResolvedValue({ error: null });
});
describe('recovery completion', () => {
  it('updates password, revokes application sessions, then signs out globally', async () => {
    const saved = vi.fn(); await completePasswordRecovery('password', { passwordSaved: false }, saved);
    expect(fixture.post).toHaveBeenCalledWith('/auth/logout-all', {}, 'recovery-token');
    expect(fixture.signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(fixture.updateUser.mock.invocationCallOrder[0]).toBeLessThan(fixture.post.mock.invocationCallOrder[0]);
    expect(fixture.post.mock.invocationCallOrder[0]).toBeLessThan(fixture.signOut.mock.invocationCallOrder[0]);
    expect(saved).toHaveBeenCalledOnce();
  });
  it('does not claim completion when revocation fails and retries without repeating the password change', async () => {
    const checkpoint = { passwordSaved: false }; fixture.post.mockRejectedValueOnce(new Error('DB unavailable'));
    await expect(completePasswordRecovery('password', checkpoint, vi.fn())).rejects.toThrow('DB unavailable');
    expect(fixture.signOut).not.toHaveBeenCalled();
    await completePasswordRecovery('password', checkpoint, vi.fn());
    expect(fixture.updateUser).toHaveBeenCalledOnce(); expect(fixture.post).toHaveBeenCalledTimes(2);
  });
  it('does not revoke sessions when the provider password update fails', async () => {
    fixture.updateUser.mockResolvedValue({ error: new Error('Update failed') });
    await expect(completePasswordRecovery('password', { passwordSaved: false }, vi.fn())).rejects.toThrow('Update failed');
    expect(fixture.post).not.toHaveBeenCalled();
  });
  it('allows retry after provider sign-out fails', async () => {
    const checkpoint = { passwordSaved: false }; fixture.signOut.mockResolvedValueOnce({ error: new Error('Logout failed') });
    await expect(completePasswordRecovery('password', checkpoint, vi.fn())).rejects.toThrow('Logout failed');
    await completePasswordRecovery('password', checkpoint, vi.fn()); expect(fixture.updateUser).toHaveBeenCalledOnce();
  });
  it('rejects missing recovery sessions', async () => {
    fixture.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(completePasswordRecovery('password', { passwordSaved: false }, vi.fn())).rejects.toThrow('session is missing');
    expect(fixture.updateUser).not.toHaveBeenCalled();
  });
});
