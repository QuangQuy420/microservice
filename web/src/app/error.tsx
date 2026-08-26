"use client";

import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/ErrorState";

// Route-level fallback for errors that escape a page's own loading/error handling
// (e.g. a render error, not just a failed fetch — those are handled inline via
// ErrorState in ProductListPage/ProductDetailPage per T26).
export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("common");

  return (
    <div>
      <ErrorState message={t("unexpectedError")} />
      <button type="button" onClick={reset}>
        {t("retry")}
      </button>
    </div>
  );
}
