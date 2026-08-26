"use client";

import { useState } from "react";
import { apiErrorDetails, useApiError } from "@/lib/api";

interface UseAuthFormResult<TPayload, TResponse> {
  isSubmitting: boolean;
  error: string | null;
  // Field-level messages from a 422 VALIDATION_ERROR, keyed by request field name.
  // Empty object whenever the failure carries no field details.
  details: Record<string, string[]>;
  success: boolean;
  submit: (payload: TPayload) => Promise<TResponse | null>;
}

export function useAuthForm<TPayload, TResponse>(
    action: (payload: TPayload) => Promise<TResponse>,
): UseAuthFormResult<TPayload, TResponse> {
  const translateError = useApiError();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string[]>>({});
  const [success, setSuccess] = useState(false);

  async function submit(payload: TPayload): Promise<TResponse | null> {
    setIsSubmitting(true);
    setError(null);
    setDetails({});
    setSuccess(false);

    try {
      const response = await action(payload);
      setSuccess(true);
      return response;
    } catch (err) {
      setError(translateError(err));
      setDetails(apiErrorDetails(err));
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    isSubmitting,
    error,
    details,
    success,
    submit,
  };
}
