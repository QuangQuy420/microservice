"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ApiError, cancelOrder, getOrderById } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { getColorSwatch } from "@/lib/format/color";
import { formatPriceVnd } from "@/lib/format/price";
import { formatOrderStatusVi } from "@/lib/labels";
import type { Order } from "@/types/order";

interface OrderDetailPageProps {
  id: string;
}

const CANCELLABLE_STATUSES = new Set(["PENDING", "AWAITING_PAYMENT", "CONFIRMED"]);

const SECTION =
  "mb-5 rounded-2xl border border-border bg-surface p-[clamp(1.2rem,3vw,1.75rem)] shadow-[0_14px_36px_rgba(43,36,32,0.06)]";
const SECTION_HEADING = "mb-4 font-heading text-[1.2rem] text-text";
// `last:mb-0` replaces the old section-paragraph `:last-child` rule.
const SECTION_TEXT = "mb-2 text-[0.9rem] leading-[1.6] text-text-secondary last:mb-0";

// FR3/FR4/T18: full order detail (items + status history), plus a cancel action shown only
// while the order is still PENDING/AWAITING_PAYMENT/CONFIRMED (matches order-service's
// OrderServiceImpl.cancelOrder eligibility check).
export function OrderDetailPage({ id }: OrderDetailPageProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function loadOrder() {
    const token = getAccessToken();
    if (!token) {
      setError("Bạn cần đăng nhập để xem đơn hàng.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await getOrderById(token, id);
      setOrder(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể tải thông tin đơn hàng.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setError("Bạn cần đăng nhập để xem đơn hàng.");
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await getOrderById(token, id);
        if (!cancelled) setOrder(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không thể tải thông tin đơn hàng.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleCancel() {
    const token = getAccessToken();
    if (!token) return;

    const reason = window.prompt("Vui lòng nhập lý do hủy đơn hàng:");
    if (reason === null) return;
    if (!reason.trim()) {
      setCancelError("Lý do hủy đơn không được để trống.");
      return;
    }

    setIsCancelling(true);
    setCancelError(null);
    try {
      await cancelOrder(token, id, reason.trim());
      await loadOrder();
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : "Không thể hủy đơn hàng.");
    } finally {
      setIsCancelling(false);
    }
  }

  if (isLoading) return <LoadingState label="Đang tải đơn hàng..." />;
  if (error) return <ErrorState message={error} />;
  if (!order) return <ErrorState message="Không tìm thấy đơn hàng." />;

  const canCancel = CANCELLABLE_STATUSES.has(order.status);

  return (
    <article
      aria-labelledby="order-detail-heading"
      className="mx-auto max-w-[1050px] py-[clamp(1.5rem,4vw,3rem)]"
    >
      <Link
        href="/orders"
        className="mb-6 inline-flex items-center gap-2 text-[0.9rem] font-medium text-text no-underline"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Về danh sách đơn hàng
      </Link>

      <h1
        id="order-detail-heading"
        className="mb-5 font-heading text-[clamp(1.75rem,3vw,2.25rem)] text-text"
      >
        Đơn hàng {order.orderCode}
      </h1>
      <p className="-mt-3 mb-6 text-[0.95rem] text-text-secondary">
        Trạng thái: {formatOrderStatusVi(order.status)}
      </p>

      <section aria-label="Lịch sử trạng thái" className={SECTION}>
        <h2 className={SECTION_HEADING}>Lịch sử trạng thái</h2>
        <ul className="flex flex-col gap-[0.6rem]">
          {order.statusHistories.map((entry) => (
            <li
              key={entry.id}
              className="rounded-lg bg-[rgba(43,36,32,0.035)] px-3 py-[0.6rem] text-[0.85rem] text-text-secondary"
            >
              <span>{formatOrderStatusVi(entry.status)}</span>
              {entry.note && <span> — {entry.note}</span>}
              <span> ({new Date(entry.changedAt).toLocaleString("vi-VN")})</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Thông tin giao hàng" className={SECTION}>
        <h2 className={SECTION_HEADING}>Thông tin giao hàng</h2>
        <p className={SECTION_TEXT}>Người nhận: {order.receiverName}</p>
        <p className={SECTION_TEXT}>Số điện thoại: {order.receiverPhone}</p>
        <p className={SECTION_TEXT}>Địa chỉ: {order.shippingAddress}</p>
        {order.note && <p className={SECTION_TEXT}>Ghi chú: {order.note}</p>}
        <p className={SECTION_TEXT}>Phương thức thanh toán: {order.paymentMethod}</p>
      </section>

      <section aria-label="Sản phẩm trong đơn hàng" className={SECTION}>
        <h2 className={SECTION_HEADING}>Sản phẩm</h2>
        <ul className="mb-4 flex flex-col gap-[0.65rem]">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex justify-between gap-3 border-b border-border pb-[0.65rem] text-[0.9rem] text-text-secondary"
            >
              <span className="flex items-center gap-[0.4rem]">
                <span
                  className="inline-block h-[14px] w-[14px] shrink-0 rounded-full border-2 border-border"
                  style={{ backgroundColor: item.colorHex ?? getColorSwatch(item.color).hex }}
                  role="img"
                  aria-label={item.color}
                  title={item.color}
                />
                {item.productName} ({item.color}, {item.size}) x{item.quantity}
              </span>
              <span className="shrink-0 font-semibold text-text">
                {formatPriceVnd(item.subtotal)}
              </span>
            </li>
          ))}
        </ul>
        <p className="pt-1 text-[1.05rem] text-text-secondary">
          Tổng cộng:{" "}
          <strong className="text-[1.2rem] text-text">{formatPriceVnd(order.totalAmount)}</strong>
        </p>
      </section>

      {canCancel && (
        <div className="mt-6 flex flex-col items-start gap-3 max-[700px]:w-full">
          <button
            type="button"
            className="btn btn-outline max-[700px]:w-full"
            onClick={handleCancel}
            disabled={isCancelling}
          >
            {isCancelling ? "Đang hủy đơn..." : "Hủy đơn hàng"}
          </button>
          {cancelError && (
            <p role="alert" className="my-[1em] text-[#a92828]">
              {cancelError}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
