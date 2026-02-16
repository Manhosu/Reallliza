"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ApiError } from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/types";

// ============================================================
// useApi – generic data-fetching hook
// ============================================================

interface UseApiReturn<T> {
  data: T | null;
  error: ApiError | null;
  isLoading: boolean;
  mutate: () => void;
}

/**
 * Generic hook for fetching data from the API.
 *
 * @param fetcher  Async function that returns the data.
 * @param deps     Dependency array – the fetcher is re-invoked whenever a
 *                 dependency changes. Defaults to `[]` (fetch once).
 */
export function useApi<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[] = []
): UseApiReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // A counter used to manually re-trigger the effect via `mutate`.
  const [refreshKey, setRefreshKey] = useState(0);

  // Keep a stable reference to the fetcher so callers don't have to
  // memoize it themselves.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const mutate = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          if (err instanceof DOMException && err.name === "AbortError") {
            // Request was aborted – do nothing.
            return;
          }
          setError(
            err instanceof ApiError
              ? err
              : new ApiError(0, (err as Error).message ?? "Unknown error")
          );
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, ...deps]);

  return { data, error, isLoading, mutate };
}

// ============================================================
// usePaginatedApi – hook for paginated endpoints
// ============================================================

interface UsePaginatedApiReturn<T> {
  data: T[] | null;
  meta: PaginatedResponse<T>["meta"] | null;
  error: ApiError | null;
  isLoading: boolean;
  page: number;
  setPage: (page: number) => void;
  limit: number;
  setLimit: (limit: number) => void;
  mutate: () => void;
}

/**
 * Hook for paginated API endpoints.
 *
 * @param fetcher       Function that receives `(page, limit)` and returns a
 *                      `PaginatedResponse<T>`.
 * @param initialPage   Starting page (defaults to `1`).
 * @param initialLimit  Items per page (defaults to `10`).
 */
export function usePaginatedApi<T>(
  fetcher: (
    page: number,
    limit: number,
    signal: AbortSignal
  ) => Promise<PaginatedResponse<T>>,
  initialPage = 1,
  initialLimit = 10
): UsePaginatedApiReturn<T> {
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const {
    data: response,
    error,
    isLoading,
    mutate,
  } = useApi<PaginatedResponse<T>>(
    (signal) => fetcherRef.current(page, limit, signal),
    [page, limit]
  );

  return {
    data: response?.data ?? null,
    meta: response?.meta ?? null,
    error,
    isLoading,
    page,
    setPage,
    limit,
    setLimit,
    mutate,
  };
}
