import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';
import { isNativePlatform } from './platform';
import { router } from '../../router';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../supabase';
import { useAppVersionStore } from '../../store/appVersionStore';
import { useWalletStore } from '../../store/walletStore';
import { parseAndValidateDeepLink } from '@gaming-hub/shared';

let isInitialized = false;

type BackButtonHandler = () => boolean;
const backButtonHandlers: BackButtonHandler[] = [];

/**
 * Registers a custom handler for the Android hardware Back button.
 * Returns an unregister cleanup function.
 * If the handler returns `true`, default back navigation is prevented.
 */
export function registerBackButtonHandler(handler: BackButtonHandler): () => void {
  backButtonHandlers.push(handler);
  return () => {
    const idx = backButtonHandlers.indexOf(handler);
    if (idx !== -1) backButtonHandlers.splice(idx, 1);
  };
}

/**
 * Initializes native Capacitor services (Back Button, Deep Linking, Status Bar, Splash Screen).
 * Safely no-ops in standard web browsers.
 */
export async function initCapacitorServices(): Promise<void> {
  if (!isNativePlatform() || isInitialized) return;
  isInitialized = true;

  try {
    // 1. Status Bar Setup
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#070b14' });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    // Graceful fallback if status bar features are unsupported on current device
  }

  try {
    // 2. Hide Splash Screen after layout is ready
    await SplashScreen.hide();
  } catch {
    // Splash screen no-op
  }

  try {
    // 3. Configure Keyboard
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch {
    // Keyboard plugin fallback
  }

  // 4. Android Hardware Back Button Handling
  CapApp.addListener('backButton', ({ canGoBack }) => {
    // If a custom handler intercepts the back button (e.g., active game exit confirmation dialog)
    if (backButtonHandlers.length > 0) {
      const topHandler = backButtonHandlers[backButtonHandlers.length - 1];
      if (topHandler && topHandler()) {
        return;
      }
    }

    const currentPath = window.location.pathname;
    const rootPaths = ['/', '/login', '/signup', '/2fa'];

    if (rootPaths.includes(currentPath) || !canGoBack) {
      // Minimize app when at root level
      void CapApp.minimizeApp();
    } else {
      // Navigate to previous route in React Router
      void router.navigate(-1);
    }
  });

  // 5. Deep Linking & App Links (Password reset, auth redirects, etc.)
  CapApp.addListener('appUrlOpen', (data) => {
    // Block all deep links when the app is hard-locked due to an outdated version.
    // This prevents any navigation from bypassing the update required screen.
    if (useAppVersionStore.getState().status === 'hard-locked') {
      void CapApp.minimizeApp();
      return;
    }

    if (!data?.url) return;

    const validated = parseAndValidateDeepLink(data.url);
    if (!validated.valid || !validated.target) {
      console.warn('[DeepLink] Rejected invalid or untrusted deep link');
      return;
    }

    // Handle Password Recovery deep links
    if (validated.isPasswordRecovery) {
      // Enforce strict password recovery state: NEVER auto-log in
      useAuthStore.getState().setIsPasswordRecovery(true);
      useAuthStore.getState().setSession(null);
      useAuthStore.getState().setUser(null);

      void router.navigate(validated.target, { replace: true });
      return;
    }

    // Handle other valid application routes
    if (validated.target && validated.target !== '/') {
      void router.navigate(validated.target);
    }
  });

  // 6. Native App Lifecycle (Foreground / Background)
  CapApp.addListener('appStateChange', (state) => {
    if (state.isActive) {
      // When resuming from background, verify auth session validity
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (!useAuthStore.getState().isPasswordRecovery) {
          useAuthStore.getState().setSession(session);
          useAuthStore.getState().setUser(session?.user ?? null);
        }
      });
      // Refresh authoritative wallet balance to catch any offline or background settlements
      void useWalletStore.getState().fetchWallet();
    }
  });
}
