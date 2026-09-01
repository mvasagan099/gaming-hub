/**
 * Returns the canonical base URL for auth redirects.
 * In production/Render/Capacitor, it uses the production origin or window.location.origin.
 */
export function getAuthRedirectUrl(path: string = "/"): string {
  const origin =
    typeof window !== "undefined" && window.location.origin && !window.location.origin.includes("capacitor://")
      ? window.location.origin
      : "https://gaming-hub-frontend.onrender.com";

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${cleanPath}`;
}
