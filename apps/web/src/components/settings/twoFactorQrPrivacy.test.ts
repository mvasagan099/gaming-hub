import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('2FA enrollment QR privacy', () => {
  it.each([
    ['settings', new URL('./TwoFactorSetup.tsx', import.meta.url)],
    ['profile', new URL('../../pages/Profile/ProfilePage.tsx', import.meta.url)],
  ])('%s never sends the authenticator secret to an external image provider', (_screen, path) => {
    const source = readFileSync(path, 'utf8');
    expect(source).not.toContain('api.qrserver.com');
    expect(source).not.toMatch(/https?:\/\/[^\s`"']+[^\n]*encodeURIComponent\((?:authUrl|twoFactorAuthUrl)\)/);
  });
});
