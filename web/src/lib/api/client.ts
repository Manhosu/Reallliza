import { createClient } from "@/lib/supabase/client";

export const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3333/api";

// ============================================================
// ApiError
// ============================================================

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

// ============================================================
// Helper: get the current access token
// ============================================================

export async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

// ============================================================
// Helper: build query string from params object
// ============================================================

export function buildQueryString(
  params?: Record<string, unknown>
): string {
  if (!params) return "";

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, String(value));
    }
  }

  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

// ============================================================
// Core request function
// ============================================================

interface RequestOptions {
  method: string;
  path: string;
  body?: unknown;
  params?: Record<string, unknown>;
  signal?: AbortSignal;
}

async function request<T>(options: RequestOptions): Promise<T> {
  const { method, path, body, params, signal } = options;

  const token = await getAccessToken();

  const url = `${BASE_URL}${path}${buildQueryString(params)}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    // Response body is not JSON
    if (!res.ok) {
      throw new ApiError(res.status, res.statusText);
    }
    return undefined as unknown as T;
  }

  if (!res.ok) {
    const errorBody = data as Record<string, unknown> | undefined;
    const message =
      (errorBody?.message as string) ||
      (errorBody?.error as string) ||
      res.statusText;
    throw new ApiError(res.status, message, errorBody);
  }

  return data as T;
}

// ============================================================
// Public API client
// ============================================================

export const apiClient = {
  get<T>(path: string, params?: Record<string, unknown>, signal?: AbortSignal) {
    return request<T>({ method: "GET", path, params, signal });
  },

  post<T>(path: string, body?: unknown) {
    return request<T>({ method: "POST", path, body });
  },

  put<T>(path: string, body?: unknown) {
    return request<T>({ method: "PUT", path, body });
  },

  patch<T>(path: string, body?: unknown) {
    return request<T>({ method: "PATCH", path, body });
  },

  delete<T>(path: string) {
    return request<T>({ method: "DELETE", path });
  },
};
