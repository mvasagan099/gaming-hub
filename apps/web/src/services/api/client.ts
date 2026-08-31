import { useAuthStore } from "../../store/authStore";
import { isNativePlatform, getPlatform } from "../native/platform";

function getApiUrl(): string {
  const envUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000/api";
  if (isNativePlatform()) {
    return envUrl;
  }
  if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return envUrl.replace("localhost", window.location.hostname).replace("127.0.0.1", window.location.hostname);
  }
  return envUrl;
}

const API_URL = getApiUrl();

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
  message?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit, tokenOverride?: string): Promise<T> {
  const token = tokenOverride ?? useAuthStore.getState().session?.access_token;
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // Inject Android version headers so the server can enforce version requirements.
  // Only sent from native Android builds; web browsers never include these headers.
  if (isNativePlatform() && getPlatform() === "android") {
    headers.set("X-App-Platform", "android");
    // Read the cached installed version from the appVersionStore to avoid calling
    // Device.getInfo() on every request. The store is populated during app init.
    const { useAppVersionStore } = await import("../../store/appVersionStore");
    const installedVersion = useAppVersionStore.getState().installedVersion;
    if (installedVersion) {
      headers.set("X-App-Version", installedVersion);
    }
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });


  if (!response.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Non-JSON error body.
    }
    if (response.status === 401) {
      const code = body.error?.code;
      if (code === "SESSION_REVOKED" || (body.error?.message && /session has been revoked|terminated because your account/i.test(body.error.message))) {
        useAuthStore.getState().signOut().catch(() => {});
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          window.location.href = "/login?reason=session_revoked";
        }
      }
    }

    throw new ApiError(
      response.status,
      body.error?.code ?? "HTTP_ERROR",
      body.error?.message ?? body.message ?? `Request failed (${response.status})`,
      body.error?.details,
    );
  }


  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const apiClient = {
  get<T>(path: string): Promise<T> {
    return request<T>(path, { method: "GET" });
  },
  post<T>(path: string, body?: unknown, tokenOverride?: string): Promise<T> {
    const requestBody = typeof FormData !== "undefined" && body instanceof FormData
      ? body
      : body === undefined
        ? "{}"
        : JSON.stringify(body);
    return request<T>(path, { method: "POST", body: requestBody }, tokenOverride);
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    const requestBody = typeof FormData !== "undefined" && body instanceof FormData
      ? body
      : body === undefined
        ? "{}"
        : JSON.stringify(body);
    return request<T>(path, { method: "PUT", body: requestBody });
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    const requestBody = typeof FormData !== "undefined" && body instanceof FormData
      ? body
      : JSON.stringify(body);
    return request<T>(path, { method: "PATCH", body: requestBody });
  },
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: "DELETE" });
  },
};
