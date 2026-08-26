"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { RecommendationGrid } from "@/components/products/RecommendationGrid";
import { useRecommendations } from "@/hooks/useRecommendations";
import type { FaceShapeTag } from "@/types/product";
import type { RecommendedProduct } from "@/types/recommendation";

const PREVIEW_LIMIT = 4;

interface RecommendationPreviewProps {
  faceShape: FaceShapeTag;
  // Forwarded to RecommendationGrid/RecommendationCard — present only on the face-analysis page,
  // where FaceAnalysisPage uses it to pick a frame to try on the active photo.
  onTryOnPhoto?: (product: RecommendedProduct) => void;
}

// Always fetches as soon as it mounts (or `faceShape` changes) — callers decide WHEN that
// happens, not this component: mounted immediately for a fresh analysis result (auto-show at the
// moment of highest intent), or only mounted after a "see suggestions" click for a history item
// (on-demand, so browsing history doesn't fire one /recommend call per past photo).
export function RecommendationPreview({ faceShape, onTryOnPhoto }: RecommendationPreviewProps) {
  const t = useTranslations("face");
  const { items, isLoading, error, recommend } = useRecommendations();

  useEffect(() => {
    void recommend(faceShape);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recommend is stable across renders.
  }, [faceShape]);

  return (
    <div>
      {isLoading && <LoadingState label={t("recommend.loading")} />}
      {!isLoading && error && <ErrorState message={error} />}
      {!isLoading && !error && items.length === 0 && (
        <p className="my-[1em] text-text-muted">{t("recommend.empty")}</p>
      )}
      {!isLoading && !error && items.length > 0 && (
        <>
          {/* The narrow result-layout sidebar (~280-340px) can't fit the full-size card, so each
              one renders as a compact thumbnail+text row — the old CSS did this with descendant
              overrides scoped to this wrapper, now a variant the card owns itself. */}
          <RecommendationGrid
            products={items.slice(0, PREVIEW_LIMIT)}
            onTryOnPhoto={onTryOnPhoto}
            variant="compact"
          />
          <Link
            href={`/recommendations?faceShape=${faceShape}`}
            className="mt-4 inline-flex shrink-0 items-center gap-[0.4rem] font-medium text-text hover:text-accent-dark"
          >
            {t("recommend.viewAll")}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </>
      )}
    </div>
  );
}
