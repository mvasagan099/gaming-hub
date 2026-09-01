import { useEffect } from 'react';
import { Browser } from '@capacitor/browser';
import { App as CapApp } from '@capacitor/app';
import { useAppVersionStore } from '../store/appVersionStore';
import { registerBackButtonHandler } from '../services/native/capacitorAppService';
import { isNativePlatform } from '../services/native/platform';

/**
 * Full-screen, non-dismissible update required screen.
 *
 * This component renders when the installed Android app version is below
 * the admin-configured minimumSupportedVersion, or when forceUpdate is true.
 *
 * IMPORTANT: There is intentionally NO way to dismiss this screen. The only
 * action available is to tap "UPDATE NOW", which opens the download URL.
 * Back-button navigation is intercepted and minimizes the app instead.
 */
export function UpdateRequiredScreen() {
  const config = useAppVersionStore((s) => s.config);
  const installedVersion = useAppVersionStore((s) => s.installedVersion);

  const downloadUrl =
    config?.downloadUrl ??
    'https://play.google.com/store/apps/details?id=com.gaminghub.app';

  const updateMessage =
    config?.updateMessage ??
    'A new version of Gaming Hub is required. Please update to continue playing.';

  const minimumVersion = config?.minimumSupportedVersion ?? '';
  const latestVersion = config?.latestVersion ?? '';

  // Register a back-button handler so the Android hardware back button
  // minimizes the app instead of navigating away from the lock screen.
  useEffect(() => {
    if (!isNativePlatform()) return;

    const unregister = registerBackButtonHandler(() => {
      void CapApp.minimizeApp();
      return true; // Intercept — prevent default navigation
    });

    return unregister;
  }, []);

  const handleUpdateNow = async () => {
    try {
      if (isNativePlatform()) {
        await Browser.open({ url: downloadUrl });
      } else {
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      // Fallback to window.open if Browser plugin fails
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #060b18 0%, #0d1a2e 50%, #080f1e 100%)',
        padding: '24px',
        fontFamily:
          '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
      role="alert"
      aria-live="assertive"
      aria-label="App update required"
    >
      {/* Background grid pattern */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(99,102,241,0.06) 1px, transparent 0)',
          backgroundSize: '32px 32px',
          pointerEvents: 'none',
        }}
      />

      {/* Glow effect */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '400px',
          height: '400px',
          background:
            'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
          borderRadius: '50%',
        }}
      />

      {/* Content card */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '420px',
          width: '100%',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: '24px',
          padding: '40px 32px',
          boxShadow:
            '0 0 0 1px rgba(99,102,241,0.1), 0 32px 64px rgba(0,0,0,0.6)',
          backdropFilter: 'blur(20px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          textAlign: 'center',
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: '88px',
            height: '88px',
            borderRadius: '24px',
            background: 'linear-gradient(135deg, rgba(79,70,229,0.3) 0%, rgba(124,58,237,0.3) 100%)',
            border: '1px solid rgba(99,102,241,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(99,102,241,0.4)',
            overflow: 'hidden',
          }}
          aria-hidden="true"
        >
          <img
            src="/logo.png"
            alt="Gaming Hub"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        </div>

        {/* Heading */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h1
            style={{
              margin: 0,
              fontSize: '26px',
              fontWeight: '800',
              color: '#ffffff',
              letterSpacing: '-0.5px',
              lineHeight: 1.2,
            }}
          >
            Update Required
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: '15px',
              color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.6,
            }}
          >
            {updateMessage}
          </p>
        </div>

        {/* Version info */}
        {(installedVersion || minimumVersion) && (
          <div
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {installedVersion && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
                  Your version
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#f87171',
                    fontFamily: 'monospace',
                  }}
                >
                  v{installedVersion}
                </span>
              </div>
            )}
            {minimumVersion && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
                  Required version
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#34d399',
                    fontFamily: 'monospace',
                  }}
                >
                  v{latestVersion || minimumVersion}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Update button */}
        <button
          id="update-now-btn"
          onClick={() => void handleUpdateNow()}
          style={{
            width: '100%',
            padding: '16px 24px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            border: 'none',
            borderRadius: '14px',
            color: '#ffffff',
            fontSize: '16px',
            fontWeight: '700',
            fontFamily: 'inherit',
            cursor: 'pointer',
            letterSpacing: '0.3px',
            boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
            transition: 'transform 0.1s ease, box-shadow 0.1s ease',
          }}
          onMouseDown={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)';
          }}
          onMouseUp={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          }}
          onTouchStart={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)';
          }}
          onTouchEnd={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          }}
          aria-label="Download the latest version of Gaming Hub"
        >
          UPDATE NOW
        </button>

        {/* Footer note */}
        <p
          style={{
            margin: 0,
            fontSize: '12px',
            color: 'rgba(255,255,255,0.25)',
            lineHeight: 1.5,
          }}
        >
          You must update to continue using Gaming Hub.
        </p>
      </div>
    </div>
  );
}
