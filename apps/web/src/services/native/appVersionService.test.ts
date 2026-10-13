import { describe, expect, it, vi, beforeEach } from 'vitest';
import { checkAppVersion } from './appVersionService';

vi.mock('@capacitor/app', () => ({
  App: {
    getInfo: vi.fn(),
  },
}));

vi.mock('./platform', () => ({
  isNativePlatform: vi.fn(),
  isAndroid: vi.fn(),
}));

import { App } from '@capacitor/app';
import { isNativePlatform, isAndroid } from './platform';

describe('checkAppVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNativePlatform).mockReturnValue(true);
    vi.mocked(isAndroid).mockReturnValue(true);
  });

  it('exempts web platform from version gating', async () => {
    vi.mocked(isNativePlatform).mockReturnValue(false);
    const result = await checkAppVersion();
    expect(result).toEqual({
      isHardLocked: false,
      isSoftPrompt: false,
      installedVersion: null,
      config: null,
    });
  });

  it('does NOT hard lock users when installed version matches latest version even if forceUpdate is true', async () => {
    vi.mocked(App.getInfo).mockResolvedValue({
      name: 'Gaming Hub',
      id: 'com.gaminghub.app',
      build: '2',
      version: '1.1',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        latestVersion: '1.1',
        minimumSupportedVersion: '1.1',
        downloadUrl: 'https://example.com/app.apk',
        updateMessage: 'A new version is required.',
        forceUpdate: true,
        updatedAt: new Date().toISOString(),
      }),
    }));

    const result = await checkAppVersion();
    expect(result.isHardLocked).toBe(false);
    expect(result.isSoftPrompt).toBe(false);
    expect(result.installedVersion).toBe('1.1');
  });

  it('hard locks users when installed version is below minimum supported version', async () => {
    vi.mocked(App.getInfo).mockResolvedValue({
      name: 'Gaming Hub',
      id: 'com.gaminghub.app',
      build: '1',
      version: '1.0',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        latestVersion: '1.1',
        minimumSupportedVersion: '1.1',
        downloadUrl: 'https://example.com/app.apk',
        updateMessage: 'A new version is required.',
        forceUpdate: false,
        updatedAt: new Date().toISOString(),
      }),
    }));

    const result = await checkAppVersion();
    expect(result.isHardLocked).toBe(true);
    expect(result.installedVersion).toBe('1.0');
  });

  it('hard locks users when installed is below latest version AND forceUpdate is true', async () => {
    vi.mocked(App.getInfo).mockResolvedValue({
      name: 'Gaming Hub',
      id: 'com.gaminghub.app',
      build: '2',
      version: '1.1',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        latestVersion: '1.2',
        minimumSupportedVersion: '1.0',
        downloadUrl: 'https://example.com/app.apk',
        updateMessage: 'A new version is required.',
        forceUpdate: true,
        updatedAt: new Date().toISOString(),
      }),
    }));

    const result = await checkAppVersion();
    expect(result.isHardLocked).toBe(true);
    expect(result.isSoftPrompt).toBe(false);
  });

  it('soft prompts users when installed is below latest version AND forceUpdate is false', async () => {
    vi.mocked(App.getInfo).mockResolvedValue({
      name: 'Gaming Hub',
      id: 'com.gaminghub.app',
      build: '2',
      version: '1.1',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        latestVersion: '1.2',
        minimumSupportedVersion: '1.0',
        downloadUrl: 'https://example.com/app.apk',
        updateMessage: 'A new version is required.',
        forceUpdate: false,
        updatedAt: new Date().toISOString(),
      }),
    }));

    const result = await checkAppVersion();
    expect(result.isHardLocked).toBe(false);
    expect(result.isSoftPrompt).toBe(true);
  });
});
