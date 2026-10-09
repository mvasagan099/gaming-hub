import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const auth = vi.hoisted(() => ({ initialize: vi.fn(), getSession: vi.fn(), exchangeCodeForSession: vi.fn() }));
vi.mock('../services/supabase', () => ({ supabase: { auth } }));
import { getAuthLinkSession } from './authLinkSession';

const session = { access_token: 'test-recovery-token', user: { id: 'recovering-user' } } as Session;
let browser: { location: { href: string }; history: { state: unknown; replaceState: ReturnType<typeof vi.fn> } };
beforeEach(() => {
  vi.resetAllMocks();
  browser = {
    location: { href: 'https://example.test/auth/callback?next=/reset-password' },
    history: { state: { router: true }, replaceState: vi.fn((_state, _title, url) => { browser.location.href = String(url); }) },
  };
  vi.stubGlobal('window', browser);
  auth.initialize.mockResolvedValue({ error: null });
  auth.getSession.mockResolvedValue({ data: { session }, error: null });
  auth.exchangeCodeForSession.mockResolvedValue({ data: { session }, error: null });
});
afterEach(() => vi.unstubAllGlobals());

describe('one-time password recovery link handling', () => {
  it('reuses the session after SDK initialization consumed the router code', async () => {
    expect(await getAuthLinkSession('consumed-code')).toBe(session);
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it('waits for SDK initialization before deciding whether to exchange', async () => {
    browser.location.href += '&code=automatic-code';
    auth.initialize.mockImplementation(async () => {
      browser.location.href = 'https://example.test/auth/callback?next=/reset-password';
      return { error: null };
    });
    expect(await getAuthLinkSession('automatic-code')).toBe(session);
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it('does not classify a slow SDK initialization as an expired link', async () => {
    let resolve!: (value: unknown) => void;
    auth.initialize.mockImplementation(() => new Promise(r => { resolve = r; }));
    const recovery = getAuthLinkSession(null);
    await Promise.resolve();
    expect(auth.getSession).not.toHaveBeenCalled();
    resolve({ error: null });
    expect(await recovery).toBe(session);
  });
  it('shares a late native-link exchange across concurrent page effects', async () => {
    browser.location.href += '&code=native-code';
    let resolve!: (value: unknown) => void;
    auth.exchangeCodeForSession.mockImplementation(() => new Promise(r => { resolve = r; }));
    const first = getAuthLinkSession('native-code');
    const replay = getAuthLinkSession('native-code');
    await vi.waitFor(() => expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1));
    resolve({ data: { session }, error: null });
    expect(await first).toBe(session);
    expect(await replay).toBe(session);
    expect(new URL(browser.location.href).searchParams.has('code')).toBe(false);
    expect(new URL(browser.location.href).searchParams.get('next')).toBe('/reset-password');
    expect(browser.history.replaceState).toHaveBeenCalledWith({ router: true }, '', expect.any(String));
    expect(await getAuthLinkSession('native-code')).toBe(session);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });
  it('does not accept an existing login when provider initialization rejects the link', async () => {
    auth.initialize.mockResolvedValue({ error: new Error('Link expired') });
    await expect(getAuthLinkSession('expired')).rejects.toThrow('Link expired');
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it('does not fall back to another session when a late code is rejected', async () => {
    browser.location.href += '&code=reused-code';
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: new Error('Code invalid') });
    await expect(getAuthLinkSession('reused-code')).rejects.toThrow('Code invalid');
    expect(auth.getSession).not.toHaveBeenCalled();
  });
  it('uses implicit recovery sessions without a manual code exchange', async () => {
    expect(await getAuthLinkSession(null)).toBe(session);
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it('keeps missing sessions invalid', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await getAuthLinkSession(null)).toBeNull();
  });
  it('propagates session lookup errors', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: new Error('Session unavailable') });
    await expect(getAuthLinkSession(null)).rejects.toThrow('Session unavailable');
  });
});
