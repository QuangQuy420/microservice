"use client";

import { useEffect, useState } from "react";
import { getProducts, useApiError } from "@/lib/api";
import type { Product, ProductListParams } from "@/types/product";

interface UseProductsResult {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  // Re-runs the same fetch on demand (e.g. after an admin delete) without waiting for a param
  // change — see AdminProductsPage.
  refetch: () => Promise<void>;
}

export function useProducts(params: ProductListParams): UseProductsResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const translateError = useApiError();

  const { categoryId, brandId, frameShape, page, pageSize, search, minPrice, maxPrice, includeAllStatuses } =
    params;

  async function run() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getProducts({
        categoryId,
        brandId,
        frameShape,
        page,
        pageSize,
        search,
        minPrice,
        maxPrice,
        includeAllStatuses,
      });
      setProducts(response.data);
    } catch (err) {
      setError(translateError(err));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function runEffect() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await getProducts({
          categoryId,
          brandId,
          frameShape,
          page,
          pageSize,
          search,
          minPrice,
          maxPrice,
          includeAllStatuses,
        });
        if (!cancelled) setProducts(response.data);
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
  }, [categoryId, brandId, frameShape, page, pageSize, search, minPrice, maxPrice, includeAllStatuses, translateError]);

  return { products, isLoading, error, refetch: run };
}
