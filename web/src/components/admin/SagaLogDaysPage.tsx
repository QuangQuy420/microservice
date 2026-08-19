"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, getSagaLogDays } from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getAccessToken } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { formatIsoDateVi } from "@/lib/format/date";
import type { SagaLogDay } from "@/types/saga-log";

const ROW =
  "grid grid-cols-[1.4fr_1fr_1fr] items-center gap-3 px-[1.1rem] py-3 text-inherit no-underline";
const ROW_HEAD =
  "bg-[rgba(43,36,32,0.04)] text-xs font-semibold tracking-[0.05em] text-text-muted uppercase";
const ROW_BODY = "border-t border-[rgba(43,36,32,0.08)] text-sm";
const BADGE = "w-fit rounded-full px-[0.6rem] py-1 text-xs font-semibold";

// Nhật ký xử lý đơn hàng — day list (T30, FR18, AC11). Mirrors AdminOrdersPage.tsx's table layout:
// one row per day that has at least one saga-log entry, most recent first (already ordered
// that way by order-service — see OrderSagaLogService.getLogDays()). Days with at least one
// WARN-level entry (`hasWarning`) are highlighted so an operator immediately sees which days
// need attention.
export function SagaLogDaysPage() {
  const [days, setDays] = useState<SagaLogDay[]>([]);
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
        const result = await getSagaLogDays(token);
        if (!cancelled) setDays(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không thể tải nhật ký đơn hàng.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-7 py-5">
        <div className="font-heading text-[1.35rem] font-semibold">Nhật ký xử lý đơn hàng</div>
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-text text-[0.8rem] font-semibold text-bg">
          AD
        </div>
      </header>

      <section className="p-7">
        {isLoading && <LoadingState label="Đang tải nhật ký..." />}
        {!isLoading && error && <ErrorState message={error} />}

        {!isLoading && !error && (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className={cn(ROW, ROW_HEAD)}>
              <span>Ngày</span>
              <span>Tổng số bản ghi</span>
              <span>Cảnh báo</span>
            </div>
            {days.map((day) => (
              <Link
                key={day.date}
                href={`/admin/saga-logs/${day.date}`}
                className={cn(ROW, ROW_BODY, day.hasWarning && "bg-[rgba(169,40,40,0.05)]")}
              >
                <span className="font-semibold">{formatIsoDateVi(day.date)}</span>
                <span>{day.totalCount}</span>
                <span>
                  {day.hasWarning ? (
                    <span className={cn(BADGE, "bg-[rgba(169,40,40,0.14)] text-[#a92828]")}>
                      Có cảnh báo
                    </span>
                  ) : (
                    <span className={cn(BADGE, "bg-[rgba(74,90,82,0.14)] text-[#4a5a52]")}>
                      Bình thường
                    </span>
                  )}
                </span>
              </Link>
            ))}
            {days.length === 0 && (
              <div className="px-[1.1rem] py-10 text-center text-sm text-text-muted">
                Chưa có nhật ký đơn hàng nào.
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
