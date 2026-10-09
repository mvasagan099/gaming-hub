import { beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ auth })) }));
import { changeProviderPassword } from '../password';
import { env } from '../../env';
describe('actual login password authority', () => {
  const user = { id: 'owner', email: 'owner@test.invalid' };
  beforeEach(() => {
    vi.resetAllMocks();
    env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'owner' }, session: {} }, error: null });
    auth.updateUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
    auth.signOut.mockResolvedValue({ error: null });
  });
  it('reauthenticates against the provider and updates that credential', async () => {
    expect(await changeProviderPassword(user, 'current', 'replacement')).toBe(true);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: user.email, password: 'current' });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'replacement' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
  });
  it('rejects incorrect current passwords before changing anything', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: new Error('Invalid credentials') });
    await expect(changeProviderPassword(user, 'wrong', 'replacement')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('cannot change another provider identity', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'other' }, session: {} }, error: null });
    await expect(changeProviderPassword(user, 'current', 'replacement')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('reports provider update failure without pretending the password changed', async () => {
    auth.updateUser.mockResolvedValue({ data: {}, error: new Error('Provider outage') });
    await expect(changeProviderPassword(user, 'current', 'replacement')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
  it('returns partial revocation failure so the route can still revoke application sessions', async () => {
    auth.signOut.mockResolvedValue({ error: new Error('Provider outage') });
    expect(await changeProviderPassword(user, 'current', 'replacement')).toBe(false);
  });
});
