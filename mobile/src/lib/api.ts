import { Platform } from 'react-native';
import { supabase } from './supabase';
import { offlineStorage } from './offline-storage';
import { useSyncStore } from './sync-manager';

// ============================================================
// Base URL Configuration
// ============================================================

// Android emulator uses 10.0.2.2 to access host's localhost
// iOS simulator uses localhost directly
const getDefaultApiUrl = () => {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3333/api';
  }
  return 'http://localhost:3333/api';
};

export const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || getDefaultApiUrl();

// ============================================================
// ApiError
// ============================================================

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

// ============================================================
// Helper: get the current access token
// ============================================================

export async function getAccessToken(): Promise<string | null> {
  try {
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
  params?: Record<string, unknown>,
): string {
  if (!params) return '';

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }

  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
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

/** Default timeout for API requests (30 seconds) */
const REQUEST_TIMEOUT_MS = 30000;
/** Default timeout for file uploads (60 seconds) */
const UPLOAD_TIMEOUT_MS = 60000;

async function request<T>(options: RequestOptions): Promise<T> {
  const { method, path, body, params, signal } = options;

  // Create timeout abort controller
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

  // If user provides a signal, listen for its abort
  if (signal) {
    signal.addEventListener('abort', () => timeoutController.abort());
  }

  try {
    const token = await getAccessToken();

    const url = `${BASE_URL}${path}${buildQueryString(params)}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: timeoutController.signal,
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
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// File upload helper
// ============================================================

interface UploadOptions {
  path: string;
  file: {
    uri: string;
    type: string;
    name: string;
  };
  fields?: Record<string, string>;
}

export async function uploadFile<T>(options: UploadOptions): Promise<T> {
  const { path, file, fields } = options;

  // Create timeout abort controller (60s for uploads)
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const token = await getAccessToken();
    const url = `${BASE_URL}${path}`;

    const formData = new FormData();

    formData.append('file', {
      uri: file.uri,
      type: file.type,
      name: file.name,
    } as unknown as Blob);

    if (fields) {
      for (const [key, value] of Object.entries(fields)) {
        formData.append(key, value);
      }
    }

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      signal: timeoutController.signal,
    });

    if (res.status === 204) {
      return undefined as unknown as T;
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
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
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// Public API client
// ============================================================

export const apiClient = {
  get<T>(
    path: string,
    params?: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    return request<T>({ method: 'GET', path, params, signal });
  },

  post<T>(path: string, body?: unknown) {
    return request<T>({ method: 'POST', path, body });
  },

  put<T>(path: string, body?: unknown) {
    return request<T>({ method: 'PUT', path, body });
  },

  patch<T>(path: string, body?: unknown) {
    return request<T>({ method: 'PATCH', path, body });
  },

  delete<T>(path: string) {
    return request<T>({ method: 'DELETE', path });
  },

  upload<T>(path: string, file: UploadOptions['file'], fields?: Record<string, string>) {
    return uploadFile<T>({ path, file, fields });
  },
};

// ============================================================
// Offline-Aware Helpers
// ============================================================

/** Check if the device is currently online (from sync store) */
export function isDeviceOnline(): boolean {
  return useSyncStore.getState().isOnline;
}

/**
 * Queue a mutating action for later sync when offline.
 * Returns a unique action id so the caller can track it.
 */
export async function queueOfflineAction(params: {
  type: 'status_change' | 'checklist_update' | 'checklist_complete' | 'photo_upload' | 'tool_checkin';
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH';
  body?: unknown;
  fileUri?: string;
  fileFields?: Record<string, string>;
  fileName?: string;
  fileType?: string;
}): Promise<string> {
  const action = await offlineStorage.queueAction({
    type: params.type,
    endpoint: params.endpoint,
    method: params.method,
    body: params.body,
    fileUri: params.fileUri,
    fileFields: params.fileFields,
    fileName: params.fileName,
    fileType: params.fileType,
  });
  await useSyncStore.getState().refreshPendingCount();
  return action.id;
}
