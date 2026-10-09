import { describe, expect, it } from 'vitest';
import { isRecoveryLocation } from './recoveryContext';
describe('recovery restoration', () => {
  it.each(['/reset-password', '/auth/reset-password'])('keeps clean %s in recovery after refresh', pathname => {
    expect(isRecoveryLocation({ pathname, search: '', hash: '' })).toBe(true);
  });
  it.each(['?next=/reset-password', '?next=%2Freset-password', '?type=recovery'])('recognizes callback %s', search => {
    expect(isRecoveryLocation({ pathname: '/auth/callback', search, hash: '' })).toBe(true);
  });
  it('recognizes implicit recovery', () => expect(isRecoveryLocation({ pathname: '/auth/callback', search: '', hash: '#type=recovery' })).toBe(true));
  it('does not classify ordinary login as recovery', () => expect(isRecoveryLocation({ pathname: '/login', search: '', hash: '' })).toBe(false));
});
