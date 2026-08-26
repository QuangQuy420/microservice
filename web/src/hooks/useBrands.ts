"use client";

import { useEffect, useState } from "react";
import { getBrands, useApiError } from "@/lib/api";
import type { Brand } from "@/types/product";

interface UseBrandsResult {
  brands: Brand[];
  isLoading: boolean;
  error: string | null;
}

export function useBrands(): UseBrandsResult {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const translateError = useApiError();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getBrands();
        if (!cancelled) setBrands(result);
      } catch (err) {
        if (!cancelled) {
          setError(translateError(err));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [translateError]);

  return { brands, isLoading, error };
}
