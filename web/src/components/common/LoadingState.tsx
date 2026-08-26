"use client";

import { useTranslations } from "next-intl";

interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label }: LoadingStateProps) {
  const t = useTranslations("common");

  return (
    <p role="status" className="my-[1em] text-text-muted">
      {label ?? t("loading")}
    </p>
  );
}
