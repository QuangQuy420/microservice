import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { LoadingState } from "@/components/common/LoadingState";
import { CheckoutPage } from "@/components/cart/CheckoutPage";

export default async function Checkout() {
  const t = await getTranslations("checkout");

  // CheckoutPage reads the selected variantIds via useSearchParams(), which Next.js requires to
  // be wrapped in Suspense so the rest of the route can still be statically rendered (same
  // pattern as the root page wrapping ProductListPage).
  return (
    <Suspense fallback={<LoadingState label={t("pageLoading")} />}>
      <CheckoutPage />
    </Suspense>
  );
}
