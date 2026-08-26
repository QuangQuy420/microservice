"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { ErrorState } from "@/components/common/ErrorState";
import { SagaLogOrdersPage } from "@/components/admin/SagaLogOrdersPage";

export default function AdminSagaLogOrders() {
  const t = useTranslations("admin");
  const params = useParams<{ date: string }>();
  const date = params.date;

  if (!date) return <ErrorState message={t("sagaLogs.dateNotFound")} />;

  return <SagaLogOrdersPage date={date} />;
}
