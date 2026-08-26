"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getOrders, useApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import type { GetOrdersParams, OrderPageResponse, OrderSummary } from "@/types/order";

// Paging defaults for when the caller passes none and the response carries no `meta` (an
// unpaginated body) — `page` is 1-based, matching the `{data, meta}` envelope.
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;

interface UseOrdersResult {
  orders: OrderSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Order history is always for the logged-in user — reads the access token itself, same as
// useCart. See useProducts.ts for the state/effect/cancellation pattern this mirrors.
export function useOrders(params: GetOrdersParams): UseOrdersResult {
  const t = useTranslations("orders");
  const translateError = useApiError();
  const [response, setResponse] = useState<OrderPageResponse<OrderSummary> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { status, page, pageSize } = params;

  async function run() {
    const token = getAccessToken();
    if (!token) {
      setResponse(null);
      setIsLoading(false);
      setError(t("loginRequired"));
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await getOrders(token, { status, page, pageSize });
      setResponse(result);
    } catch (err) {
      setError(translateError(err));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function runEffect() {
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setResponse(null);
          setIsLoading(false);
          setError(t("loginRequired"));
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await getOrders(token, { status, page, pageSize });
        if (!cancelled) setResponse(result);
      } catch (err) {
        if (!cancelled) {
          setError(translateError(err));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void runEffect();

    return () => {
      cancelled = true;
    };
  }, [status, page, pageSize, t, translateError]);

  // `meta` is what the server actually paged by, so it wins over the requested params; both are
  // absent only before the first successful response (or on an unpaginated body).
  const meta = response?.meta;
  const resolvedPageSize = meta?.pageSize ?? pageSize ?? DEFAULT_PAGE_SIZE;
  const total = meta?.total ?? 0;

  return {
    orders: response?.data ?? [],
    page: meta?.page ?? page ?? DEFAULT_PAGE,
    pageSize: resolvedPageSize,
    total,
    totalPages: resolvedPageSize > 0 ? Math.ceil(total / resolvedPageSize) : 0,
    isLoading,
    error,
    refetch: run,
  };
}
