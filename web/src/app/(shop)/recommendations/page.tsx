import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { LoadingState } from "@/components/common/LoadingState";
import { RecommendationsPage } from "@/components/products/RecommendationsPage";

export default async function Recommendations() {
  const t = await getTranslations("recommendations");

  // RecommendationsPage reads faceShape via useSearchParams(), which Next.js requires to be
  // wrapped in Suspense so the rest of the route can still be statically rendered (same pattern
  // as the root page wrapping ProductListPage).
  return (
    <Suspense fallback={<LoadingState label={t("loading")} />}>
      <RecommendationsPage />
    </Suspense>
  );
}
