import { safeRandomUUID } from "@gaming-hub/shared";

/**
 * Polyfills crypto.randomUUID in non-secure browser contexts (such as mobile HTTP on LAN IP).
 * Browsers only expose window.crypto.randomUUID in Secure Contexts (HTTPS / localhost),
 * which throws "crypto.randomUUID is not a function" on LAN testing devices.
 */
if (typeof window !== "undefined" || typeof globalThis !== "undefined") {
  const g = typeof window !== "undefined" ? window : globalThis;

  // 1. Polyfill on Crypto.prototype if available (handles non-extensible crypto instances)
  if (typeof Crypto !== "undefined" && Crypto.prototype && typeof Crypto.prototype.randomUUID !== "function") {
    try {
      Object.defineProperty(Crypto.prototype, "randomUUID", {
        value: safeRandomUUID,
        configurable: true,
        writable: true,
      });
    } catch {
      (Crypto.prototype as unknown as { randomUUID: typeof safeRandomUUID }).randomUUID = safeRandomUUID;
    }
  }

  // 2. Ensure global crypto object exists
  if (typeof g.crypto === "undefined") {
    try {
      Object.defineProperty(g, "crypto", {
        value: {},
        configurable: true,
        writable: true,
      });
    } catch {
      (g as unknown as { crypto: unknown }).crypto = {};
    }
  }

  // 3. Define randomUUID on crypto instance directly
  if (g.crypto && typeof g.crypto.randomUUID !== "function") {
    try {
      Object.defineProperty(g.crypto, "randomUUID", {
        value: safeRandomUUID,
        configurable: true,
        writable: true,
      });
    } catch {
      (g.crypto as unknown as { randomUUID: typeof safeRandomUUID }).randomUUID = safeRandomUUID;
    }
  }
}
