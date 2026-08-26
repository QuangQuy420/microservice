"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useRecommendations } from "@/hooks/useRecommendations";
import { useLabels } from "@/lib/labels";
import type { FaceShapeTag } from "@/types/product";
import { RecommendationGrid } from "./RecommendationGrid";

// Ported from the old .face-analysis page-shell rules (shared with FaceAnalysisPage).
const PAGE_CLASS = "mx-auto max-w-[1050px]";
const TITLE_CLASS =
  "mb-[0.6rem] font-heading text-[clamp(1.75rem,4vw,2.375rem)] font-semibold";

const FACE_SHAPE_VALUES: FaceShapeTag[] = ["OVAL", "ROUND", "SQUARE", "HEART", "DIAMOND", "OBLONG"];

function isFaceShapeTag(value: string | null): value is FaceShapeTag {
  return value !== null && (FACE_SHAPE_VALUES as string[]).includes(value);
}

// Reads the face shape to recommend for from a URL query param (?faceShape=OVAL), set by the
// "see recommended frames" link on FaceAnalysisPage — shareable/bookmarkable like
// ProductListPage's filter params.
export function RecommendationsPage() {
  const t = useTranslations("recommendations");
  const labels = useLabels();
  const searchParams = useSearchParams();
  const faceShapeParam = searchParams.get("faceShape");
  const { items, isLoading, error, recommend } = useRecommendations();

  useEffect(() => {
    if (isFaceShapeTag(faceShapeParam)) {
      void recommend(faceShapeParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recommend is stable across renders.
  }, [faceShapeParam]);

  if (!isFaceShapeTag(faceShapeParam)) {
    return (
      <section aria-labelledby="recommendations-heading" className={PAGE_CLASS}>
        <h1 id="recommendations-heading" className={TITLE_CLASS}>
          {t("title")}
        </h1>
        <ErrorState message={t("missingFaceShape")} />
      </section>
    );
  }

  return (
    <section aria-labelledby="recommendations-heading" className={PAGE_CLASS}>
      <p className="mb-[0.6rem] text-[0.8rem] font-semibold tracking-[0.1em] text-text-muted uppercase">
        {t("eyebrow")}
      </p>
      <h1 id="recommendations-heading" className={TITLE_CLASS}>
        {t("titleForFaceShape", { faceShape: labels.faceShape(faceShapeParam) })}
      </h1>
      <p className="mb-7 text-[0.97rem] leading-[1.6] text-text-secondary">
        {t("description")}
      </p>

      {isLoading && <LoadingState label={t("loading")} />}
      {!isLoading && error && <ErrorState message={error} />}
      {!isLoading && !error && items.length === 0 && (
        <p className="my-[1em] text-text-muted">{t("empty")}</p>
      )}
      {!isLoading && !error && items.length > 0 && <RecommendationGrid products={items} />}
    </section>
  );
}
