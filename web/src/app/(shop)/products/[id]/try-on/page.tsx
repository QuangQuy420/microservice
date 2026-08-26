"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/ErrorState";
import { TryOnPage } from "@/components/tryon/TryOnPage";

export default function ProductTryOn() {
  const t = useTranslations("tryon");
  const params = useParams<{ id: string }>();
  const id = params.id;

  if (!id) return <ErrorState message={t("productNotFound")} />;

  return <TryOnPage id={id} />;
}
