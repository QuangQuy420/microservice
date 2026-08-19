"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, getSagaLogsForDay } from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getAccessToken } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { formatIsoDateVi } from "@/lib/format/date";
import { formatSagaLogLevelVi } from "@/lib/labels";
import type { OrderLogSummary } from "@/types/saga-log";

const ROW =
  "grid grid-cols-[1.4fr_1fr_1fr_1.4fr] items-center gap-3 px-[1.1rem] py-3 text-inherit no-underline";
const ROW_HEAD =
  "bg-[rgba(43,36,32,0.04)] text-xs font-semibold tracking-[0.05em] text-text-muted uppercase";
const ROW_BODY = "border-t border-[rgba(43,36,32,0.08)] text-sm";
const BADGE = "w-fit rounded-full px-[0.6rem] py-1 text-xs font-semibold";

interface SagaLogOrdersPageProps {
  date: string;
}

// Nhật ký xử lý đơn hàng — order list for one day (T30, FR18, AC11/AC12). One row per order with
// saga-log activity on `date`, showing how many entries it has and the worst (most severe)
// level among them, so an operator can tell at a glance which orders need a closer look.
export function SagaLogOrdersPage({ date }: SagaLogOrdersPageProps) {
  const [orders, setOrders] = useState<OrderLogSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setError("Vui lòng đăng nhập lại.");
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await getSagaLogsForDay(token, date);
        if (!cancelled) setOrders(result);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Không thể tải danh sách đơn hàng trong ngày.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [date]);

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-7 py-5">
        <div className="font-heading text-[1.35rem] font-semibold">Nhật ký xử lý đơn hàng — ngày {formatIsoDateVi(date)}</div>
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-text text-[0.8rem] font-semibold text-bg">
          AD
        </div>
      </header>

      <section className="p-7">
        <Link
          href="/admin/saga-logs"
          className="mb-6 inline-flex items-center gap-2 text-[0.9rem] font-medium text-text no-underline"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Về danh sách ngày
        </Link>

        {isLoading && <LoadingState label="Đang tải danh sách đơn hàng..." />}
        {!isLoading && error && <ErrorState message={error} />}

        {!isLoading && !error && (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className={cn(ROW, ROW_HEAD)}>
              <span>Mã đơn hàng</span>
              <span>Số bản ghi</span>
              <span>Mức cao nhất</span>
              <span>Hoạt động gần nhất</span>
            </div>
            {orders.map((order) => {
              const isWarning = order.worstLevel === "WARN";
              return (
                <Link
                  key={order.orderId}
                  href={`/admin/saga-logs/${date}/${order.orderId}`}
                  className={cn(ROW, ROW_BODY, isWarning && "bg-[rgba(169,40,40,0.05)]")}
                >
                  <span className="font-semibold">{order.orderCode}</span>
                  <span>{order.entryCount}</span>
                  <span>
                    <span
                      className={cn(
                        BADGE,
                        isWarning
                          ? "bg-[rgba(169,40,40,0.14)] text-[#a92828]"
                          : "bg-[rgba(74,90,82,0.14)] text-[#4a5a52]",
                      )}
                    >
                      {formatSagaLogLevelVi(order.worstLevel)}
                    </span>
                  </span>
                  <span>{new Date(order.lastOccurredAt).toLocaleString("vi-VN")}</span>
                </Link>
              );
            })}
            {orders.length === 0 && (
              <div className="px-[1.1rem] py-10 text-center text-sm text-text-muted">
                Không có đơn hàng nào có hoạt động trong ngày này.
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
