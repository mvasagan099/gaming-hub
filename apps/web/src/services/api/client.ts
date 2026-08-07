import { useAuthStore } from "../../store/authStore";

function getApiUrl(): string {
  const envUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000/api";
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

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!response.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Non-JSON error body.
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
    return request<T>(path, { method: "POST", body: body === undefined ? "{}" : JSON.stringify(body) }, tokenOverride);
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "PUT", body: body === undefined ? "{}" : JSON.stringify(body) });
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
  },
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: "DELETE" });
  },
};
