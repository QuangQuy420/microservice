"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/ErrorState";
import { ProductDetailPage } from "@/components/products/ProductDetailPage";

export default function ProductDetail() {
  const params = useParams<{ id: string }>();
  const t = useTranslations("products");
  const id = params.id;

  if (!id) return <ErrorState message={t("notFound")} />;

  return <ProductDetailPage id={id} />;
}
