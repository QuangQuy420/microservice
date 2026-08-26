"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ProductEditForm } from "@/components/admin/ProductEditForm";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProduct } from "@/hooks/useProduct";

export default function EditProductPage() {
  const t = useTranslations("admin");
  const params = useParams<{ id: string }>();
  const id = params.id;

  if (!id) return <ErrorState message={t("products.notFound")} />;

  return <EditProductForm id={id} />;
}

function EditProductForm({ id }: { id: string }) {
  const t = useTranslations("admin");
  const { product, isLoading, error } = useProduct(id);

  if (isLoading) return <LoadingState label={t("products.loading")} />;
  if (error || !product) return <ErrorState message={error ?? t("products.notFound")} />;

  return <ProductEditForm product={product} />;
}
