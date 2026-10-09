import { beforeEach, describe, expect, it, vi } from 'vitest';
const services = vi.hoisted(() => ({ post: vi.fn(), signOut: vi.fn() }));
vi.mock('../services/api/client', () => ({ apiClient: { post: services.post } }));
vi.mock('../services/supabase', () => ({ supabase: { auth: { signOut: services.signOut } } }));
import { useAuthStore } from './authStore';
import type { Session } from '@supabase/supabase-js';

describe('verified application login state', () => {
  const session = { access_token: 'credential', user: { id: 'owner' } } as Session;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('sessionStorage', { setItem: vi.fn(), removeItem: vi.fn() });
    useAuthStore.getState().clearAuth();
    services.signOut.mockResolvedValue({ error: null });
  });
  it('does not promote a provider session during a backend outage', async () => {
    services.post.mockRejectedValue(new Error('503'));
    await expect(useAuthStore.getState().verifySession(session)).rejects.toThrow('503');
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });
  it('restoration parks pending MFA without granting protected access', async () => {
    services.post.mockResolvedValue({ status: 'mfa_required', requiresTwoFactor: true });
    expect(await useAuthStore.getState().verifySession(session)).toBe('mfa_pending');
    expect(useAuthStore.getState()).toMatchObject({ session: null, user: null, pendingMfaSession: session, isMfaRequired: true });
  });
  it('token refresh and foreground restoration remain MFA pending', async () => {
    services.post.mockResolvedValue({ status: 'mfa_required' });
    await useAuthStore.getState().verifySession(session);
    await useAuthStore.getState().verifySession({ ...session, access_token: 'refreshed-credential' });
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().isMfaRequired).toBe(true);
    expect(services.signOut).not.toHaveBeenCalled();
  });
  it('promotes only a positively verified application session', async () => {
    services.post.mockResolvedValue({ status: 'authenticated' });
    await useAuthStore.getState().verifySession(session);
    expect(useAuthStore.getState()).toMatchObject({ session, user: session.user, isMfaRequired: false, pendingMfaSession: null });
  });
  it('an unexpected response cannot grant access', async () => {
    services.post.mockResolvedValue({ status: 'unknown' });
    await expect(useAuthStore.getState().verifySession(session)).rejects.toThrow();
    expect(useAuthStore.getState().session).toBeNull();
  });
  it('keeps the verified game mounted without publishing an unverified refresh token', async () => {
    let resolve!: (value: unknown) => void;
    useAuthStore.setState({ session, user: session.user });
    services.post.mockImplementation(() => new Promise(r => { resolve = r; }));
    const renewed = { ...session, access_token: 'new-credential' };
    const verifying = useAuthStore.getState().verifySession(renewed);
    await vi.waitFor(() => expect(resolve).toBeDefined());
    expect(useAuthStore.getState().session).toBe(session);
    expect(useAuthStore.getState().isLoading).toBe(false);
    resolve({ status: 'authenticated' });
    await verifying;
    expect(useAuthStore.getState().session).toBe(renewed);
  });
  it('logout revokes the application credential before provider logout', async () => {
    useAuthStore.setState({ session });
    services.post.mockResolvedValue({ ok: true });
    await useAuthStore.getState().signOut();
    expect(services.post).toHaveBeenCalledWith('/auth/logout', {}, session.access_token);
    expect(services.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(useAuthStore.getState().session).toBeNull();
  });
  it('an in-flight verification cannot restore a logged-out session', async () => {
    let resolve!: (value: unknown) => void;
    services.post.mockImplementation((path: string) => path === '/auth/session' ? new Promise(r => { resolve = r; }) : Promise.resolve({ ok: true }));
    const verifying = useAuthStore.getState().verifySession(session);
    await vi.waitFor(() => expect(resolve).toBeDefined());
    await useAuthStore.getState().signOut();
    resolve({ status: 'authenticated' });
    expect(await verifying).toBe('superseded');
    expect(useAuthStore.getState().session).toBeNull();
  });
  it('failed remote logout still clears local access and reports the failure', async () => {
    useAuthStore.setState({ session });
    services.post.mockRejectedValue(new Error('offline'));
    await expect(useAuthStore.getState().signOut()).rejects.toThrow('offline');
    expect(services.signOut).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().session).toBeNull();
  });
});
