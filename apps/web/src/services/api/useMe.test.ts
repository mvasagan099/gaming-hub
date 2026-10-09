import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ effects: [] as Array<() => unknown>, state: {} as any, get: vi.fn(), signOut: vi.fn() }));
vi.mock('react', () => ({ useEffect: (effect: () => unknown) => fixture.effects.push(effect), useState: (value: unknown) => [value, vi.fn()] }));
vi.mock('../../store/authStore', () => {
  const store = Object.assign((select: any) => select(fixture.state), {
    getState: () => fixture.state,
    setState: (change: any) => Object.assign(fixture.state, change),
  });
  return { useAuthStore: store };
});
vi.mock('./client', () => ({ apiClient: { get: fixture.get }, ApiError: class extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
} }));
vi.mock('./practiceReward', () => ({ WALLET_CHANGED_EVENT: 'wallet' }));
vi.mock('./enterprise', () => ({ NOTIFICATION_CHANGED_EVENT: 'notification' }));
import { useMe } from './useMe';
import { ApiError } from './client';

describe('profile request authentication transitions', () => {
  const original = { access_token: 'original' };
  const refreshed = { access_token: 'refreshed' };
  beforeEach(() => {
    vi.clearAllMocks(); fixture.effects = [];
    fixture.state = { session: original, pendingMfaSession: null, signOut: fixture.signOut };
    vi.stubGlobal('sessionStorage', { setItem: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('keeps the refreshed pending credential when an older profile request returns MFA_PENDING', async () => {
    fixture.get.mockImplementation(async () => {
      fixture.state.pendingMfaSession = refreshed;
      throw new ApiError(403, 'MFA_PENDING', 'Complete MFA');
    });
    useMe(); fixture.effects[0]();
    await vi.waitFor(() => expect(fixture.state.isMfaRequired).toBe(true));
    expect(fixture.state.pendingMfaSession).toBe(refreshed);
    expect(fixture.signOut).not.toHaveBeenCalled();
  });
  it('parks the current credential if there is no newer pending session', async () => {
    fixture.get.mockRejectedValue(new ApiError(403, 'MFA_PENDING', 'Complete MFA'));
    useMe(); fixture.effects[0]();
    await vi.waitFor(() => expect(fixture.state.isMfaRequired).toBe(true));
    expect(fixture.state.pendingMfaSession).toBe(original);
    expect(fixture.state.session).toBeNull();
  });
  it('does not sign out a valid login for a normal permission denial', async () => {
    fixture.get.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Denied'));
    useMe(); fixture.effects[0]();
    await vi.waitFor(() => expect(fixture.get).toHaveBeenCalled());
    expect(fixture.signOut).not.toHaveBeenCalled();
    expect(fixture.state.session).toBe(original);
  });
});
