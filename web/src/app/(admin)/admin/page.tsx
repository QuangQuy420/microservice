"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getAdminOrdersSummary, getProducts, listUsers, useApiError } from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getAccessToken } from "@/lib/auth/session";
import { ORDER_STATUSES, useLabels } from "@/lib/labels";
import type { AdminOrdersSummary } from "@/types/order";

const STATS_GRID = "mb-6 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5";
const STAT_CARD = "rounded-lg border border-border bg-surface px-[1.1rem] py-4";
const STAT_LABEL = "mb-1.5 text-[0.78rem] text-text-muted";
const STAT_VALUE = "font-heading text-[1.35rem] font-semibold";

// Admin dashboard (T11, AC5) — total products/customers/orders plus a per-status order-count
// breakdown, all read-only. Reuses getProducts/listUsers (already used by the products/users
// admin pages for the same "total" numbers) alongside the new getAdminOrdersSummary.
export default function AdminDashboardPage() {
  const t = useTranslations("admin");
  const labels = useLabels();
  const translateError = useApiError();
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [ordersSummary, setOrdersSummary] = useState<AdminOrdersSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setError(t("dashboard.sessionExpired"));
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const [productsResult, usersResult, summaryResult] = await Promise.all([
          getProducts({ pageSize: 1 }),
          listUsers(token, 1, 1),
          getAdminOrdersSummary(token),
        ]);
        if (!cancelled) {
          setTotalProducts(productsResult.meta?.total ?? 0);
          setTotalCustomers(usersResult.meta?.total ?? 0);
          setOrdersSummary(summaryResult);
        }
      } catch (err) {
        if (!cancelled) {
          setError(translateError(err));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [t, translateError]);

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-7 py-5">
        <div className="font-heading text-[1.35rem] font-semibold">{t("dashboard.title")}</div>
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-text text-[0.8rem] font-semibold text-bg">
          AD
        </div>
      </header>

      <section className="p-7">
        {isLoading && <LoadingState label={t("dashboard.loading")} />}
        {!isLoading && error && <ErrorState message={error} />}

        {!isLoading && !error && (
          <>
            <div className={STATS_GRID}>
              <div className={STAT_CARD}>
                <div className={STAT_LABEL}>{t("dashboard.totalProducts")}</div>
                <div className={STAT_VALUE}>{totalProducts}</div>
              </div>
              <div className={STAT_CARD}>
                <div className={STAT_LABEL}>{t("dashboard.totalCustomers")}</div>
                <div className={STAT_VALUE}>{totalCustomers}</div>
              </div>
              <div className={STAT_CARD}>
                <div className={STAT_LABEL}>{t("dashboard.totalOrders")}</div>
                <div className={STAT_VALUE}>{ordersSummary?.totalOrders ?? 0}</div>
              </div>
            </div>

            {/* Restores the browser default <h2> size/margin that Tailwind's preflight removes. */}
            <h2 className="my-[0.83em] text-[1.5em] font-bold">{t("dashboard.ordersByStatus")}</h2>
            <div className={STATS_GRID}>
              {ORDER_STATUSES.map((status) => (
                <div key={status} className={STAT_CARD}>
                  <div className={STAT_LABEL}>{labels.orderStatus(status)}</div>
                  <div className={STAT_VALUE}>
                    {ordersSummary?.ordersByStatus[status] ?? 0}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
