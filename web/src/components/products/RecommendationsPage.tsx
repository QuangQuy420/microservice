"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useRecommendations } from "@/hooks/useRecommendations";
import { formatFaceShapeVi } from "@/lib/labels";
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
// "Xem gọng kính được gợi ý" link on FaceAnalysisPage — shareable/bookmarkable like
// ProductListPage's filter params.
export function RecommendationsPage() {
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
          Gọng kính được gợi ý
        </h1>
        <ErrorState message="Không xác định được dáng khuôn mặt. Vui lòng phân tích khuôn mặt trước." />
      </section>
    );
  }

  return (
    <section aria-labelledby="recommendations-heading" className={PAGE_CLASS}>
      <p className="mb-[0.6rem] text-[0.8rem] font-semibold tracking-[0.1em] text-text-muted uppercase">
        Gợi ý dành cho bạn
      </p>
      <h1 id="recommendations-heading" className={TITLE_CLASS}>
        Gọng kính phù hợp với dáng mặt {formatFaceShapeVi(faceShapeParam)}
      </h1>
      <p className="mb-7 text-[0.97rem] leading-[1.6] text-text-secondary">
        Danh sách gọng kính được xếp hạng theo mức độ phù hợp với dáng khuôn mặt của bạn.
      </p>

      {isLoading && <LoadingState label="Đang tải gọng kính được gợi ý..." />}
      {!isLoading && error && <ErrorState message={error} />}
      {!isLoading && !error && items.length === 0 && (
        <p className="my-[1em] text-text-muted">Chưa có gọng kính nào phù hợp với dáng mặt này.</p>
      )}
      {!isLoading && !error && items.length > 0 && <RecommendationGrid products={items} />}
    </section>
  );
}
