import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { LoadingState } from "@/components/common/LoadingState";
import { ProductListPage } from "@/components/products/ProductListPage";

export default async function Home() {
  const t = await getTranslations("products");

  // ProductListPage reads filters via useSearchParams(), which Next.js requires to be
  // wrapped in Suspense so the rest of the route can still be statically rendered.
  return (
    <Suspense fallback={<LoadingState label={t("loading")} />}>
      <ProductListPage />
    </Suspense>
  );
}
