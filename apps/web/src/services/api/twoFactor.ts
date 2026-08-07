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
};
