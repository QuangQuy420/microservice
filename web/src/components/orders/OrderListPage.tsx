"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useOrders } from "@/hooks/useOrders";
import { formatPriceVnd } from "@/lib/format/price";
import { formatOrderStatusVi, ORDER_STATUSES } from "@/lib/labels";
import type { OrderStatus } from "@/types/order";

const PAGE_SIZE = 10;

// The order history reuses the admin table's row rhythm; the column track is the five-column
// "orders" variant. Head and body rows share the geometry and differ only in type/borders.
const TABLE_ROW =
  "grid grid-cols-[1.2fr_1.8fr_1fr_1fr_1.3fr] items-center gap-3 px-[1.1rem] py-3";

// FR3/T18: paginated order history for the logged-in user, with an optional status filter.
export function OrderListPage() {
  const [status, setStatus] = useState<OrderStatus | undefined>(undefined);
  const [page, setPage] = useState(0);

  const { orders, totalPages, isLoading, error } = useOrders({ status, page, size: PAGE_SIZE });

  function handleStatusChange(value: string) {
    setStatus(value ? (value as OrderStatus) : undefined);
    setPage(0);
  }

  return (
    <section
      aria-labelledby="orders-heading"
      className="mx-auto max-w-[1050px] py-[clamp(1.5rem,4vw,3rem)]"
    >
      <h1
        id="orders-heading"
        className="mb-5 font-heading text-[clamp(1.75rem,3vw,2.25rem)] text-text"
      >
        Đơn hàng của tôi
      </h1>

      <label
        htmlFor="orders-status-filter"
        className="mb-6 flex max-w-[280px] flex-col gap-[0.4rem] text-[0.82rem] font-[650] text-text-secondary"
      >
        Lọc theo trạng thái
        <select
          id="orders-status-filter"
          className="min-h-[44px] rounded-[10px] border border-border bg-[#fffdf9] px-3 py-[0.6rem] font-body text-[0.88rem] text-text outline-none focus:border-accent focus:shadow-[0_0_0_3px_rgba(201,123,74,0.13)]"
          value={status ?? ""}
          onChange={(event) => handleStatusChange(event.target.value)}
        >
          <option value="">Tất cả</option>
          {ORDER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {formatOrderStatusVi(value)}
            </option>
          ))}
        </select>
      </label>

      {isLoading && <LoadingState label="Đang tải đơn hàng..." />}
      {!isLoading && error && <ErrorState message={error} />}

      {!isLoading && !error && orders.length === 0 && (
        <p className="rounded-2xl border border-border bg-surface p-[clamp(1.5rem,4vw,2.5rem)] text-center text-text-muted">
          Bạn chưa có đơn hàng nào.
        </p>
      )}

      {!isLoading && !error && orders.length > 0 && (
        <>
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div
              className={`${TABLE_ROW} bg-[rgba(43,36,32,0.04)] text-[0.75rem] font-semibold tracking-[0.05em] uppercase text-text-muted`}
            >
              <span>Mã đơn hàng</span>
              <span>Người nhận</span>
              <span>Tổng tiền</span>
              <span>Trạng thái</span>
              <span>Ngày đặt</span>
            </div>
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className={`${TABLE_ROW} border-t border-t-[rgba(43,36,32,0.08)] text-[0.875rem] text-inherit no-underline`}
              >
                <span className="font-semibold">{order.orderCode}</span>
                <span>
                  {order.receiverName}
                  <span className="text-[0.75rem] text-text-muted"> · {order.receiverPhone}</span>
                </span>
                <span className="font-medium">{formatPriceVnd(order.totalAmount)}</span>
                <span className="w-fit rounded-full bg-[rgba(138,122,99,0.14)] px-[0.6rem] py-1 text-[0.75rem] font-semibold text-text-muted">
                  {formatOrderStatusVi(order.status)}
                </span>
                <span>{new Date(order.createdAt).toLocaleString("vi-VN")}</span>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 text-[0.85rem] text-text-secondary">
              <button
                type="button"
                className="btn btn-outline btn-small"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page <= 0}
              >
                Trang trước
              </button>
              <span>
                Trang {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-outline btn-small"
                onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                disabled={page >= totalPages - 1}
              >
                Trang sau
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
