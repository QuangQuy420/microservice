"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { analyzeFace, useApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import type { FaceAnalysisResult } from "@/types/face";

interface UseFaceAnalysisResult {
  result: FaceAnalysisResult | null;
  isLoading: boolean;
  error: string | null;
  analyze: (file: File) => Promise<void>;
}

// Action-triggered (not fetch-on-mount like useProduct) — analyze() runs on file select.
export function useFaceAnalysis(): UseFaceAnalysisResult {
  const [result, setResult] = useState<FaceAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("face");
  const translateError = useApiError();

  async function analyze(file: File) {
    const token = getAccessToken();
    if (!token) {
      setResult(null);
      setError(t("loginRequired"));
      return;
    }

    setIsLoading(true);
    setError(null);
    // Clear the previous result up front — otherwise, while a second photo is being
    // analyzed, the page would keep showing the FIRST photo's result (its imageUrl takes
    // precedence over the freshly-selected local preview) until the new request resolves.
    setResult(null);
    try {
      const analysis = await analyzeFace(file, token);
      setResult(analysis);
    } catch (err) {
      setResult(null);
      setError(translateError(err));
    } finally {
      setIsLoading(false);
    }
  }

  return { result, isLoading, error, analyze };
}
