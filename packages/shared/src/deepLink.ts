/**
 * M-06: Secure Capacitor Deep-Link Validation
 *
 * Enforces strict validation of deep-link URLs to prevent:
 * - Arbitrary URL scheme execution (javascript:, intent:, file:)
 * - Open redirect attacks via redirect / redirectTo query params
 * - Path traversal / injection
 * - Sensitive token leakage in logs
 */

const ALLOWED_SCHEMES = new Set(["com.gaminghub.app:", "https:"]);
const HTTPS_HOSTS = new Set(["app.gaminghub.com", "gaminghub.com"]);
const CUSTOM_HOSTS = new Set(["auth", "reset-password", "verify-email"]);
const ALLOWED_PATHS = new Set(["/auth/callback", "/auth/reset-password", "/auth/verify-email", "/reset-password", "/verify-email"]);

const ALLOWED_QUERY_KEYS = new Set([
  "code",
  "state",
  "error",
  "error_description",
  "error_code",
  "type",
  "access_token",
  "refresh_token",
  "token_type",
  "expires_in",
  "matchId",
  "tournamentId",
  "roomId",
]);

export interface DeepLinkValidationResult {
  valid: boolean;
  target?: string;
  isPasswordRecovery?: boolean;
  reason?: string;
}

/**
 * Validates and sanitises an incoming native or web deep-link.
 * Returns { valid: true, target: "/sanitized-path?safe-query#safe-hash", isPasswordRecovery: boolean }
 * or { valid: false, reason: "..." }
 */
export function parseAndValidateDeepLink(rawUrl: string): DeepLinkValidationResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, reason: "Empty or invalid URL" };
  }

  const trimmed = rawUrl.trim();

  // Basic sanity check to reject control characters and protocols like javascript:
  if (/[\u0000-\u001F\u007F-\u009F]/.test(trimmed)) {
    return { valid: false, reason: "URL contains control characters" };
  }

  // Check for path traversal on path component only before URL constructor normalizes it
  const rawPathOnly = trimmed.replace(/^[a-zA-Z0-9._-]+:\/+/, "").split("?")[0].split("#")[0];
  if (rawPathOnly.includes("..") || rawPathOnly.includes("//") || rawPathOnly.includes("\\")) {
    return { valid: false, reason: "Path contains illegal traversal sequences" };
  }

  let parsed: URL;
  try {
    // Normalise custom scheme if needed (e.g. com.gaminghub.app://path)
    parsed = new URL(trimmed);
  } catch {
    // Attempt parsing as custom scheme relative slug
    if (trimmed.startsWith("com.gaminghub.app:")) {
      try {
        const withoutScheme = trimmed.replace(/^com\.gaminghub\.app:\/*/, "/");
        parsed = new URL(`https://app.gaminghub.com${withoutScheme.startsWith("/") ? withoutScheme : `/${withoutScheme}`}`);
      } catch {
        return { valid: false, reason: "Failed to parse deep link URL" };
      }
    } else {
      return { valid: false, reason: "Malformed URL" };
    }
  }

  // 1. Validate Scheme
  const protocol = parsed.protocol.toLowerCase();
  if (!ALLOWED_SCHEMES.has(protocol)) {
    return { valid: false, reason: `Disallowed scheme: ${protocol}` };
  }

  // If http/https, validate host
  if (protocol === "https:") {
    const hostname = parsed.hostname.toLowerCase();
    if (!HTTPS_HOSTS.has(hostname)) {
      return { valid: false, reason: `Disallowed host: ${hostname}` };
    }
  } else if (protocol === "com.gaminghub.app:") {
    const host = parsed.host.toLowerCase();
    if (!CUSTOM_HOSTS.has(host)) {
      return { valid: false, reason: `Disallowed custom scheme host: ${host}` };
    }
  }

  // 2. Extract and Validate Path
  let pathname = parsed.pathname;
  if (protocol === "com.gaminghub.app:" && parsed.host) {
    pathname = `/${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  }

  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }

  // Reject path traversal and illegal characters
  if (pathname.includes("..") || pathname.includes("//") || pathname.includes("\\")) {
    return { valid: false, reason: "Path contains illegal traversal sequences" };
  }

  if (!/^\/[a-zA-Z0-9_\-\/]*$/.test(pathname)) {
    return { valid: false, reason: "Path contains forbidden characters" };
  }
  if (!ALLOWED_PATHS.has(pathname)) {
    return { valid: false, reason: `Disallowed path: ${pathname}` };
  }

  // 3. Sanitise Query Parameters (Allowlist only; strip open-redirect vectors)
  const safeSearchParams = new URLSearchParams();
  for (const [key, value] of parsed.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    // Explicitly reject open-redirect parameters
    if (["redirect", "redirectto", "redirect_to", "redirect_url", "next", "returnto", "return_url", "returnurl", "url", "target"].includes(lowerKey)) {
      continue;
    }
    if (ALLOWED_QUERY_KEYS.has(key)) {
      safeSearchParams.append(key, value);
    }
  }

  // 4. Sanitise Hash
  let safeHash = "";
  if (parsed.hash) {
    const rawHash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
    // If hash contains query-like params (e.g. #access_token=...&type=recovery)
    if (rawHash.includes("=")) {
      const hashParams = new URLSearchParams(rawHash);
      const safeHashParams = new URLSearchParams();
      for (const [key, value] of hashParams.entries()) {
        const lowerKey = key.toLowerCase();
        if (["redirect", "redirectto", "redirect_to", "redirect_url", "next", "returnto", "return_url", "returnurl", "url", "target"].includes(lowerKey)) {
          continue;
        }
        if (ALLOWED_QUERY_KEYS.has(key)) {
          safeHashParams.append(key, value);
        }
      }
      const hashStr = safeHashParams.toString();
      if (hashStr) {
        safeHash = `#${hashStr}`;
      }
    } else if (/^[a-zA-Z0-9_-]+$/.test(rawHash)) {
      safeHash = `#${rawHash}`;
    }
  }

  // 5. Detect Password Recovery Flow
  const queryStr = safeSearchParams.toString();
  const searchPart = queryStr ? `?${queryStr}` : "";
  const isPasswordRecovery =
    pathname === "/reset-password" ||
    searchPart.includes("type=recovery") ||
    safeHash.includes("type=recovery");

  let target = `${pathname}${searchPart}${safeHash}`;
  if (isPasswordRecovery && pathname !== "/reset-password") {
    target = `/reset-password${searchPart}${safeHash}`;
  }

  return {
    valid: true,
    target,
    isPasswordRecovery,
  };
}
