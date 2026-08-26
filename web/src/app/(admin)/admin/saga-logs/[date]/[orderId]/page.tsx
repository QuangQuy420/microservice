"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { ErrorState } from "@/components/common/ErrorState";
import { SagaLogDetailPage } from "@/components/admin/SagaLogDetailPage";

export default function AdminSagaLogDetail() {
  const t = useTranslations("admin");
  const params = useParams<{ date: string; orderId: string }>();
  const date = params.date;
  const orderId = params.orderId;

  if (!date || !orderId) return <ErrorState message={t("sagaLogs.orderNotFound")} />;

  return <SagaLogDetailPage orderId={orderId} date={date} />;
}
