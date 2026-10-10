import { beforeEach, describe, expect, it, vi } from 'vitest';
import jsQR from 'jsqr';
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useMemo: (build: () => any) => build() }));
import { AuthenticatorQr, buildAuthenticatorQr } from './AuthenticatorQr';

// Test-only enrollment key. No real account or provider is contacted.
const uri = 'otpauth://totp/Gaming%20Hub%3Atest%40example.test?secret=JBSWY3DPEHPK3PXP&issuer=Gaming%20Hub';
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden'); })); });
describe('local authenticator QR', () => {
  it('round-trips the enrollment URI through an independent QR decoder without network access', () => {
    const element = AuthenticatorQr({ authUrl: uri, className: 'w-48 h-48' });
    expect(element.type).toBe('svg'); expect(element.props.className).toBe('w-48 h-48');
    const children = element.props.children as any[];
    const size = children[0].props.width as number, scale = 6, width = size * scale;
    const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
    const path = children[1].props.d as string;
    for (const match of path.matchAll(/M(\d+),(\d+)h1v1h-1z/g)) {
      const x = Number(match[1]) * scale, y = Number(match[2]) * scale;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const offset = ((y + dy) * width + x + dx) * 4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
      }
    }
    expect(jsQR(pixels, width, width)?.data).toBe(uri);
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(element.props)).not.toContain('JBSWY3DPEHPK3PXP');
  });
  it.each(['', 'https://external.example/?secret=private', 'otpauth://hotp/account?secret=private', 'otpauth://totp/account', 'x'.repeat(4097)])('rejects invalid enrollment input without remote fallback', input => {
    expect(buildAuthenticatorQr(input)).toBeNull();
    expect(AuthenticatorQr({ authUrl: input }).props.role).toBe('status');
    expect(fetch).not.toHaveBeenCalled();
  });
});
