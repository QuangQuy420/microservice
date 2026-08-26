"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { AdminOrderDetailPage } from "@/components/admin/AdminOrderDetailPage";
import { ErrorState } from "@/components/common/ErrorState";

export default function AdminOrderDetail() {
  const t = useTranslations("admin");
  const params = useParams<{ id: string }>();
  const id = params.id;

  if (!id) return <ErrorState message={t("orders.detail.notFound")} />;

  return <AdminOrderDetailPage id={id} />;
}
