"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/ErrorState";
import { OrderDetailPage } from "@/components/orders/OrderDetailPage";

export default function OrderDetail() {
  const t = useTranslations("orders");
  const params = useParams<{ id: string }>();
  const id = params.id;

  if (!id) return <ErrorState message={t("detail.notFound")} />;

  return <OrderDetailPage id={id} />;
}
