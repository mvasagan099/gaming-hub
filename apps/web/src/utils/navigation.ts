import type { NavigateFunction } from 'react-router-dom';

/**
 * List of pathnames representing the application's root / home views.
 */
export const HOME_ROUTES = ['/', '/home', '/dashboard'];

/**
 * Checks if a given pathname corresponds to a home route.
 */
export function isHomePage(pathname: string): boolean {
  if (!pathname) return true;
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return HOME_ROUTES.includes(normalized);
}

/**
 * Checks if the browser history has a previous entry within the Single Page Application.
 * React Router v6 tracks navigation depth in window.history.state.idx.
 * When idx > 0, there is a previous entry within the current session.
 */
export function canGoBackWithinApp(): boolean {
  if (typeof window === 'undefined') return false;
  const state = window.history.state as { idx?: number } | null;
  return typeof state?.idx === 'number' && state.idx > 0;
}

/**
 * Navigates back if history exists within the app; otherwise navigates to fallback (default '/').
 * Prevents accidentally leaving the application when no useful in-app history exists.
 */
export function goBackOrHome(
  navigate: NavigateFunction,
  fallback: string = '/'
): void {
  if (canGoBackWithinApp()) {
    navigate(-1);
  } else {
    navigate(fallback);
  }
}
