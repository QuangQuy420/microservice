"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import {
  apiErrorDetails,
  getAdminOrderDetail,
  updateOrderStatusAdmin,
  useApiError,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { getColorSwatch } from "@/lib/format/color";
import { formatPriceVnd } from "@/lib/format/price";
import { ORDER_STATUSES, useLabels } from "@/lib/labels";
import type { Order, OrderStatus } from "@/types/order";

interface AdminOrderDetailPageProps {
  id: string;
}

const SECTION =
  "mb-5 rounded-2xl border border-border bg-surface p-[clamp(1.2rem,3vw,1.75rem)] shadow-[0_14px_36px_rgba(43,36,32,0.06)]";
const SECTION_HEADING = "mb-4 font-heading text-[1.2rem] text-text";
const SECTION_TEXT = "mb-2 text-[0.9rem] leading-[1.6] text-text-secondary last:mb-0";
const STATUS_LABEL =
  "flex w-full max-w-[320px] flex-col gap-[0.4rem] text-[0.82rem] font-[650] text-text-secondary";
const STATUS_CONTROL =
  "min-h-[44px] w-full rounded-[10px] border border-border bg-[#fffdf9] px-3 py-[0.6rem] font-body text-[0.88rem] text-text outline-none focus:border-accent focus:shadow-[0_0_0_3px_rgba(201,123,74,0.13)]";

// Admin order detail (T13, AC7/AC8) — items, shipping info, full status history for ANY order
// (not just the caller's own, unlike OrderDetailPage.tsx which this pattern-matches), plus:
// - a cancellation-reason callout when the order's current status is CANCELLED, sourced from the
//   most recent CANCELLED status-history entry's `note` (that's where
//   OrderSagaEventListener.handlePaymentFailed writes the failure reason).
// - a status-change control. The dropdown intentionally offers every OrderStatus rather than
//   re-implementing order-service's transition graph client-side (plan Q1) — an invalid choice
//   is rejected by the backend and its translated error is shown inline (AC8), not thrown.
export function AdminOrderDetailPage({ id }: AdminOrderDetailPageProps) {
  const t = useTranslations("admin");
  const labels = useLabels();
  const translateError = useApiError();

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nextStatus, setNextStatus] = useState<OrderStatus>("PENDING");
  const [statusNote, setStatusNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function loadOrder() {
    const token = getAccessToken();
    if (!token) {
      setError(t("orders.detail.loginRequired"));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await getAdminOrderDetail(token, id);
      setOrder(result);
      setNextStatus(result.status);
    } catch (err) {
      setError(translateError(err));
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
          setError(t("orders.detail.loginRequired"));
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await getAdminOrderDetail(token, id);
        if (!cancelled) {
          setOrder(result);
          setNextStatus(result.status);
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
  }, [id, t, translateError]);

  async function handleStatusSubmit() {
    const token = getAccessToken();
    if (!token) {
      setStatusError(t("orders.detail.actionLoginRequired"));
      return;
    }

    setIsSubmitting(true);
    setStatusError(null);
    setFieldErrors({});
    try {
      await updateOrderStatusAdmin(token, id, nextStatus, statusNote.trim() || undefined);
      setStatusNote("");
      await loadOrder();
    } catch (err) {
      setStatusError(translateError(err));
      setFieldErrors(apiErrorDetails(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <LoadingState label={t("orders.detail.loading")} />;
  if (error) return <ErrorState message={error} />;
  if (!order) return <ErrorState message={t("orders.detail.notFound")} />;

  // The most recent CANCELLED status-history entry — order.status already reflects the latest
  // transition, so "latest entry is CANCELLED" is exactly "order.status === CANCELLED"; among
  // (normally one) CANCELLED entries, pick the one with the newest changedAt for its note.
  const latestCancelEntry =
    order.status === "CANCELLED"
      ? [...order.statusHistories]
          .filter((entry) => entry.status === "CANCELLED")
          .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())[0]
      : undefined;

  return (
    <article
      aria-labelledby="admin-order-detail-heading"
      className="mx-auto max-w-[1050px] py-[clamp(1.5rem,4vw,3rem)]"
    >
      <Link
        href="/admin/orders"
        className="mb-6 inline-flex items-center gap-2 text-[0.9rem] font-medium text-text no-underline"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        {t("orders.detail.backToList")}
      </Link>

      <h1
        id="admin-order-detail-heading"
        className="mb-5 font-heading text-[clamp(1.75rem,3vw,2.25rem)] text-text"
      >
        {t("orders.detail.heading", { orderCode: order.orderCode })}
      </h1>
      <p className="-mt-3 mb-6 text-[0.95rem] text-text-secondary">
        {t("orders.detail.statusLine", { status: labels.orderStatus(order.status) })}
      </p>

      {latestCancelEntry?.note && (
        <div
          className="mb-6 rounded-[10px] border border-[rgba(169,40,40,0.35)] bg-[rgba(169,40,40,0.06)] px-4 py-3 text-[0.9rem] leading-[1.5] text-[#a92828]"
          role="alert"
        >
          <strong>{t("orders.detail.cancelReason")}</strong> {latestCancelEntry.note}
        </div>
      )}

      <section aria-label={t("orders.detail.shippingHeading")} className={SECTION}>
        <h2 className={SECTION_HEADING}>{t("orders.detail.shippingHeading")}</h2>
        <p className={SECTION_TEXT}>
          {t("orders.detail.receiver", { name: order.receiverName })}
        </p>
        <p className={SECTION_TEXT}>{t("orders.detail.phone", { phone: order.receiverPhone })}</p>
        <p className={SECTION_TEXT}>
          {t("orders.detail.address", { address: order.shippingAddress })}
        </p>
        {order.note && <p className={SECTION_TEXT}>{t("orders.detail.note", { note: order.note })}</p>}
        <p className={SECTION_TEXT}>
          {t("orders.detail.paymentMethod", { method: order.paymentMethod })}
        </p>
      </section>

      <section aria-label={t("orders.detail.itemsSectionLabel")} className={SECTION}>
        <h2 className={SECTION_HEADING}>{t("orders.detail.itemsHeading")}</h2>
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
          {t("orders.detail.totalLabel")}{" "}
          <strong className="text-[1.2rem] text-text">{formatPriceVnd(order.totalAmount)}</strong>
        </p>
      </section>

      <section aria-label={t("orders.detail.statusSectionLabel")} className={SECTION}>
        <h2 className={SECTION_HEADING}>{t("orders.detail.statusHeading")}</h2>
        <div className="mt-6 flex flex-col items-start gap-3 max-[700px]:w-full">
          <label htmlFor="admin-order-status-select" className={STATUS_LABEL}>
            {t("orders.detail.newStatus")}
            <select
              id="admin-order-status-select"
              className={STATUS_CONTROL}
              value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value as OrderStatus)}
            >
              {ORDER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {labels.orderStatus(value)}
                </option>
              ))}
            </select>
          </label>
          {fieldErrors.status?.map((msg) => (
            <p key={msg} role="alert" className="my-[0.25em] text-[#a92828]">
              {msg}
            </p>
          ))}

          <label htmlFor="admin-order-status-note" className={STATUS_LABEL}>
            {t("orders.detail.noteLabel")}
            <input
              id="admin-order-status-note"
              type="text"
              className={STATUS_CONTROL}
              value={statusNote}
              onChange={(event) => setStatusNote(event.target.value)}
              placeholder={t("orders.detail.notePlaceholder")}
            />
          </label>
          {fieldErrors.note?.map((msg) => (
            <p key={msg} role="alert" className="my-[0.25em] text-[#a92828]">
              {msg}
            </p>
          ))}

          <button
            type="button"
            className="btn btn-primary max-[700px]:w-full"
            onClick={handleStatusSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? t("orders.detail.updating") : t("orders.detail.updateStatus")}
          </button>

          {statusError && (
            <p role="alert" className="my-[1em] text-[#a92828]">
              {statusError}
            </p>
          )}
        </div>
      </section>

      <section aria-label={t("orders.detail.historyHeading")} className={SECTION}>
        <h2 className={SECTION_HEADING}>{t("orders.detail.historyHeading")}</h2>
        <ul className="flex flex-col gap-[0.6rem]">
          {order.statusHistories.map((entry) => (
            <li
              key={entry.id}
              className="rounded-lg bg-[rgba(43,36,32,0.035)] px-3 py-[0.6rem] text-[0.85rem] text-text-secondary"
            >
              <span>{labels.orderStatus(entry.status)}</span>
              {entry.note && <span> — {entry.note}</span>}
              <span> ({new Date(entry.changedAt).toLocaleString("vi-VN")})</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
