"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { listAdminOrders, useApiError } from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getAccessToken } from "@/lib/auth/session";
import { formatPriceVnd } from "@/lib/format/price";
import { ORDER_STATUSES, useLabels } from "@/lib/labels";
import { cn } from "@/lib/cn";
import type { OrderStatus, OrderSummary } from "@/types/order";

const PAGE_SIZE = 20;

const ROW = "grid grid-cols-[1.2fr_1.8fr_1fr_1fr_1.3fr] items-center gap-3 px-[1.1rem] py-3 text-inherit no-underline";
const ROW_HEAD =
  "bg-[rgba(43,36,32,0.04)] text-xs font-semibold tracking-[0.05em] text-text-muted uppercase";
const ROW_BODY = "border-t border-[rgba(43,36,32,0.08)] text-sm";

// Admin order list (T12, AC6) — all orders across every customer, with a status filter and
// pagination. Pagination is 1-based, matching the unified `{data, meta}` envelope every service
// now returns (meta.page is 1-based) — see OrderListPage.tsx for the customer-facing equivalent
// this mirrors. `totalPages` is derived from meta.total/meta.pageSize since the envelope no
// longer carries it.
export default function AdminOrdersPage() {
  const t = useTranslations("admin");
  const labels = useLabels();
  const translateError = useApiError();

  const [status, setStatus] = useState<OrderStatus | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setError(t("orders.sessionExpired"));
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await listAdminOrders(token, { status, page, pageSize: PAGE_SIZE });
        if (!cancelled) {
          const pageSize = result.meta?.pageSize ?? PAGE_SIZE;
          const totalCount = result.meta?.total ?? result.data.length;
          setOrders(result.data);
          setTotal(totalCount);
          setTotalPages(pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0);
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
  }, [status, page, t, translateError]);

  function handleStatusChange(value: string) {
    setStatus(value ? (value as OrderStatus) : undefined);
    setPage(1);
  }

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-7 py-5">
        <div className="font-heading text-[1.35rem] font-semibold">{t("orders.title")}</div>
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-text text-[0.8rem] font-semibold text-bg">
          AD
        </div>
      </header>

      <section className="p-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <label
            htmlFor="admin-orders-status-filter"
            className="mb-6 flex max-w-[280px] flex-col gap-[0.4rem] text-[0.82rem] font-[650] text-text-secondary"
          >
            {t("orders.filterByStatus")}
            <select
              id="admin-orders-status-filter"
              className="min-h-[44px] rounded-[10px] border border-border bg-[#fffdf9] px-3 py-[0.6rem] font-body text-[0.88rem] text-text outline-none focus:border-accent focus:shadow-[0_0_0_3px_rgba(201,123,74,0.13)]"
              value={status ?? ""}
              onChange={(event) => handleStatusChange(event.target.value)}
            >
              <option value="">{t("orders.allStatuses")}</option>
              {ORDER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {labels.orderStatus(value)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isLoading && <LoadingState label={t("orders.loading")} />}
        {!isLoading && error && <ErrorState message={error} />}

        {!isLoading && !error && (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className={cn(ROW, ROW_HEAD)}>
              <span>{t("orders.columnCode")}</span>
              <span>{t("orders.columnCustomer")}</span>
              <span>{t("orders.columnTotal")}</span>
              <span>{t("orders.columnStatus")}</span>
              <span>{t("orders.columnCreatedAt")}</span>
            </div>
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/admin/orders/${order.id}`}
                className={cn(ROW, ROW_BODY)}
              >
                <span className="font-semibold">{order.orderCode}</span>
                <span>
                  {order.receiverName}
                  <span className="text-xs text-text-muted"> · {order.receiverPhone}</span>
                </span>
                <span className="font-medium">{formatPriceVnd(order.totalAmount)}</span>
                <span className="w-fit rounded-full bg-[rgba(138,122,99,0.14)] px-[0.6rem] py-1 text-xs font-semibold text-text-muted">
                  {labels.orderStatus(order.status)}
                </span>
                <span>{new Date(order.createdAt).toLocaleString("vi-VN")}</span>
              </Link>
            ))}
            {orders.length === 0 && (
              <div className="px-[1.1rem] py-10 text-center text-sm text-text-muted">
                {t("orders.empty")}
              </div>
            )}
          </div>
        )}

        {!isLoading && !error && totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 text-[0.85rem] text-text-secondary">
            <button
              type="button"
              className="btn btn-outline btn-small"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              {t("orders.previousPage")}
            </button>
            <span>{t("orders.pageInfo", { page, totalPages, total })}</span>
            <button
              type="button"
              className="btn btn-outline btn-small"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
            >
              {t("orders.nextPage")}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
