import { apiClient } from "./client";

interface Setup2FAResponse {
  ok: boolean;
  secret: string;
  authUrl: string;
}

interface Verify2FAResponse {
  ok: boolean;
  enabled?: boolean;
}

/** Compute the same base URL as client.ts — VITE_API_URL already includes /api */
function getApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000/api";
  if (
    typeof window !== "undefined" &&
    (envUrl.includes("localhost") || envUrl.includes("127.0.0.1")) &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  ) {
    return envUrl.replace("localhost", window.location.hostname).replace("127.0.0.1", window.location.hostname);
  }
  return envUrl;
}

export const twoFactorApi = {
  setup: (): Promise<Setup2FAResponse> => {
    return apiClient.post<Setup2FAResponse>("/security/2fa/setup", { enable: true });
  },

  verify: (token: string): Promise<Verify2FAResponse> => {
    return apiClient.post<Verify2FAResponse>("/security/2fa/verify", { token });
  },

  disable: (token: string): Promise<{ ok: boolean }> => {
    return apiClient.post<{ ok: boolean }>("/security/2fa/disable", { token });
  },

  verifyLogin: (userId: string, token: string): Promise<{ ok: boolean }> => {
    return apiClient.post<{ ok: boolean }>("/security/2fa/verify-login", { userId, token });
  },

  /** Verify TOTP using the current apiClient session token (post-login step-up) */
  verifySession: (token: string): Promise<{ ok: boolean }> => {
    return apiClient.post<{ ok: boolean }>("/auth/2fa/verify", { token });
  },

  /**
   * Verify TOTP during login-time 2FA using an explicit Bearer token.
   *
   * Used during the login flow where the Supabase session exists in memory
   * (pendingMfaSession) but has NOT been stored in authStore.session yet.
   * We must supply the raw access token manually so the backend can authenticate
   * the request and validate the TOTP against the correct user's secret.
   */
  verifyLoginTimeTotp: async (code: string, bearerToken: string): Promise<{ ok: boolean; mfaVerified: boolean }> => {
    const url = `${getApiBaseUrl()}/auth/2fa/verify`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({ token: code }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: "Verification failed" }));
      throw new Error(err.message || "Invalid 2FA code");
    }

    return response.json();
  },
};
