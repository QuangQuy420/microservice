"use client";

import { useEffect, useState } from "react";
import { getMyAddresses, useApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import type { Address } from "@/types/user";

interface UseAddressesResult {
  addresses: Address[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Saved shipping addresses for the logged-in user — reads the access token itself, same
// pattern as useCart/useOrders. Used by CheckoutPage to let the user pick a saved address
// instead of retyping receiver/address fields every time.
export function useAddresses(): UseAddressesResult {
  const translateError = useApiError();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const token = getAccessToken();
    if (!token) {
      setAddresses([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setAddresses(await getMyAddresses(token));
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
          setAddresses([]);
          setIsLoading(false);
          setError(null);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const list = await getMyAddresses(token);
        if (!cancelled) setAddresses(list);
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
  }, [translateError]);

  return { addresses, isLoading, error, refetch: run };
}
