"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "./client";

// FR5: backend errors carry a stable English `message` plus a machine-readable `code`. The web
// translates the code through the `errors` namespace; a code we don't know (or a body with no
// code at all) falls back to the backend's English message, so an error is never blank.

type ErrorTranslator = ReturnType<typeof useTranslations>;

export function translateApiError(error: unknown, t: ErrorTranslator): string {
  if (!(error instanceof ApiError)) {
    return t("UNEXPECTED_ERROR");
  }

  if (error.code && t.has(error.code)) {
    return t(error.code);
  }

  return error.message || t("UNEXPECTED_ERROR");
}

// The form every component uses: `const translateError = useApiError();` then
// `setError(translateError(err))` in the catch block.
export function useApiError(): (error: unknown) => string {
  const t = useTranslations("errors");

  return useCallback((error: unknown) => translateApiError(error, t), [t]);
}

// Field-level messages from a 422 VALIDATION_ERROR, for rendering under the matching input.
// Empty object for every other failure, so a form can read it unconditionally.
export function apiErrorDetails(error: unknown): Record<string, string[]> {
  return error instanceof ApiError && error.details ? error.details : {};
}
