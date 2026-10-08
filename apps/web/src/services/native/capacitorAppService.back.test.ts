import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ listeners: new Map<string, any>(), navigate: vi.fn(), minimize: vi.fn() }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn((event, handler) => { native.listeners.set(event, handler); }),
  minimizeApp: native.minimize,
} }));
vi.mock('@capacitor/status-bar', () => ({ StatusBar: { setStyle: vi.fn(), setBackgroundColor: vi.fn(), setOverlaysWebView: vi.fn() }, Style: { Dark: 'dark' } }));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: vi.fn() } }));
vi.mock('@capacitor/keyboard', () => ({ Keyboard: { setAccessoryBarVisible: vi.fn() } }));
vi.mock('./platform', () => ({ isNativePlatform: () => true }));
vi.mock('../../router', () => ({ router: { navigate: native.navigate } }));
vi.mock('../../store/authStore', () => ({ useAuthStore: { getState: vi.fn() } }));
vi.mock('../supabase', () => ({ supabase: {} }));
vi.mock('../../store/appVersionStore', () => ({ useAppVersionStore: { getState: vi.fn() } }));
vi.mock('../../store/walletStore', () => ({ useWalletStore: { getState: vi.fn() } }));
import { initCapacitorServices, registerBackButtonHandler } from './capacitorAppService';

beforeAll(async () => { await initCapacitorServices(); });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('window', { location: { pathname: '/games/chess' }, history: { state: { idx: 2 } } });
});
afterEach(() => vi.unstubAllGlobals());
describe('native Back handling', () => {
  it('gives the active game confirmation priority even without browser history', () => {
    const requestExit = vi.fn(() => true);
    const unregister = registerBackButtonHandler(requestExit);
    try {
      native.listeners.get('backButton')({ canGoBack: false });
      expect(requestExit).toHaveBeenCalledOnce();
      expect(native.navigate).not.toHaveBeenCalled();
      expect(native.minimize).not.toHaveBeenCalled();
    } finally { unregister(); }
    native.listeners.get('backButton')({ canGoBack: true });
    expect(native.navigate).toHaveBeenCalledExactlyOnceWith(-1);
  });
  it('immediately navigates back from a game with in-app history', () => {
    native.listeners.get('backButton')({ canGoBack: true });
    expect(native.navigate).toHaveBeenCalledExactlyOnceWith(-1);
    expect(native.minimize).not.toHaveBeenCalled();
  });
  it('uses home fallback when there is no in-app history', () => {
    window.history.state.idx = 0;
    native.listeners.get('backButton')({ canGoBack: true });
    expect(native.navigate).toHaveBeenCalledExactlyOnceWith('/');
  });
  it('keeps the normal root/minimize behavior', () => {
    native.listeners.get('backButton')({ canGoBack: false });
    expect(native.minimize).toHaveBeenCalledOnce();
    expect(native.navigate).not.toHaveBeenCalled();
  });
});
