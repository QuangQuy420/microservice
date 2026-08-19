"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, getOrderSagaLogs } from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getAccessToken } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { formatSagaLogRowStatusVi, formatSagaLogServiceVi, formatSagaLogStageVi } from "@/lib/labels";
import type { OrderSagaLog } from "@/types/saga-log";

const ROW =
  "grid grid-cols-[1fr_1.15fr_0.85fr_0.85fr_0.8fr_1.5fr_0.7fr] items-start gap-3 px-[1.1rem] py-3 text-inherit no-underline";
const ROW_HEAD =
  "bg-[rgba(43,36,32,0.04)] text-xs font-semibold tracking-[0.05em] text-text-muted uppercase";
const ROW_BODY = "border-t border-[rgba(43,36,32,0.08)] text-sm";
const BADGE = "w-fit rounded-full px-[0.6rem] py-1 text-xs font-semibold";

interface SagaLogDetailPageProps {
  orderId: string;
  date: string;
}

// Nhật ký xử lý đơn hàng — full saga timeline for one order (T30, FR14/FR18, AC11/AC12/AC13).
// Rendered as a table (not a bare timeline list) so each row reads as one saga event: which
// service fired it (sourceService), which service it was addressed to (targetService — for a
// RECONCILIATION_RESENT row this is also "which service the retry went to"), a plain
// success/failure status (derived from level), the error reason in its own "Ghi chú" column
// (errorDetail — only WARN rows ever have one), and how many automatic retry attempts the order
// had so far (retryCount — only set on RECONCILIATION_RESENT/RECONCILIATION_EXHAUSTED rows, the
// only stages that are part of the reconciliation retry loop). Oldest first — the API
// (OrderSagaLogRepository.findByOrderIdOrderByOccurredAtAsc) already returns entries in that
// order, the client-side sort here is just a defensive guarantee, not a correction.
//
// Note: OrderSagaLogResponse (the API contract) carries no orderCode — so the heading identifies
// the order by its id (the only identifier this screen has without extra plumbing beyond what
// the plan scoped).
export function SagaLogDetailPage({ orderId, date }: SagaLogDetailPageProps) {
  const [logs, setLogs] = useState<OrderSagaLog[]>([]);
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
        const result = await getOrderSagaLogs(token, orderId);
        if (!cancelled) setLogs(result);
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
  }, [orderId]);

  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-7 py-5">
        <div className="font-heading text-[1.35rem] font-semibold">Chi tiết nhật ký xử lý đơn hàng</div>
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-text text-[0.8rem] font-semibold text-bg">
          AD
        </div>
      </header>

      <section className="p-7">
        <Link
          href={`/admin/saga-logs/${date}`}
          className="mb-6 inline-flex items-center gap-2 text-[0.9rem] font-medium text-text no-underline"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Về danh sách đơn hàng trong ngày
        </Link>

        {isLoading && <LoadingState label="Đang tải nhật ký..." />}
        {!isLoading && error && <ErrorState message={error} />}

        {!isLoading && !error && (
          <article className="mb-5 rounded-2xl border border-border bg-surface p-[clamp(1.2rem,3vw,1.75rem)] shadow-[0_14px_36px_rgba(43,36,32,0.06)]">
            <h2 className="mb-4 font-heading text-[1.2rem] text-text">
              Dòng thời gian đơn hàng {orderId}
            </h2>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className={cn(ROW, ROW_HEAD)}>
                <span>Thời gian</span>
                <span>Mốc sự kiện</span>
                <span>Nơi bắn sự kiện</span>
                <span>Nơi nhận sự kiện</span>
                <span>Trạng thái</span>
                <span>Ghi chú</span>
                <span>Số lần retry</span>
              </div>
              {sortedLogs.map((entry, index) => {
                const isWarning = entry.level === "WARN";
                return (
                  <div
                    key={`${entry.stage}-${entry.occurredAt}-${index}`}
                    className={cn(ROW, ROW_BODY, isWarning && "bg-[rgba(169,40,40,0.05)]")}
                  >
                    <span>{new Date(entry.occurredAt).toLocaleString("vi-VN")}</span>
                    <span className="font-semibold">{formatSagaLogStageVi(entry.stage)}</span>
                    <span>{formatSagaLogServiceVi(entry.sourceService)}</span>
                    <span>{formatSagaLogServiceVi(entry.targetService)}</span>
                    <span>
                      <span
                        className={cn(
                          BADGE,
                          isWarning
                            ? "bg-[rgba(169,40,40,0.14)] text-[#a92828]"
                            : "bg-[rgba(74,90,82,0.14)] text-[#4a5a52]",
                        )}
                      >
                        {formatSagaLogRowStatusVi(entry.level)}
                      </span>
                    </span>
                    <span>{entry.errorDetail ?? "—"}</span>
                    <span>{entry.retryCount ?? "—"}</span>
                  </div>
                );
              })}
            </div>
            {sortedLogs.length === 0 && (
              <div className="px-[1.1rem] py-10 text-center text-sm text-text-muted">
                Chưa có nhật ký nào cho đơn hàng này.
              </div>
            )}
          </article>
        )}
      </section>
    </>
  );
}
