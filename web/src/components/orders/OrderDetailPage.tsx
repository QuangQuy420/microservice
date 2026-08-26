"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { apiErrorDetails, cancelOrder, getOrderById, useApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { getColorSwatch } from "@/lib/format/color";
import { formatPriceVnd } from "@/lib/format/price";
import { useLabels } from "@/lib/labels";
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
  const t = useTranslations("orders");
  const labels = useLabels();
  const translateError = useApiError();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  // Field-level messages from a 422 on the cancel call (`reason`), rendered as-is (FR5).
  const [cancelFieldErrors, setCancelFieldErrors] = useState<Record<string, string[]>>({});

  async function loadOrder() {
    const token = getAccessToken();
    if (!token) {
      setError(t("detail.loginRequired"));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await getOrderById(token, id);
      setOrder(result);
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
          setError(t("detail.loginRequired"));
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

  async function handleCancel() {
    const token = getAccessToken();
    if (!token) return;

    const reason = window.prompt(t("detail.cancelPrompt"));
    if (reason === null) return;
    if (!reason.trim()) {
      setCancelError(t("detail.cancelReasonRequired"));
      return;
    }

    setIsCancelling(true);
    setCancelError(null);
    setCancelFieldErrors({});
    try {
      await cancelOrder(token, id, reason.trim());
      await loadOrder();
    } catch (err) {
      setCancelError(translateError(err));
      setCancelFieldErrors(apiErrorDetails(err));
    } finally {
      setIsCancelling(false);
    }
  }

  if (isLoading) return <LoadingState label={t("loading")} />;
  if (error) return <ErrorState message={error} />;
  if (!order) return <ErrorState message={t("detail.notFound")} />;

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
        {t("detail.backToList")}
      </Link>

      <h1
        id="order-detail-heading"
        className="mb-5 font-heading text-[clamp(1.75rem,3vw,2.25rem)] text-text"
      >
        {t("detail.title", { code: order.orderCode })}
      </h1>
      <p className="-mt-3 mb-6 text-[0.95rem] text-text-secondary">
        {t("detail.status", { status: labels.orderStatus(order.status) })}
      </p>

      <section aria-label={t("detail.statusHistoryTitle")} className={SECTION}>
        <h2 className={SECTION_HEADING}>{t("detail.statusHistoryTitle")}</h2>
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

      <section aria-label={t("detail.shippingTitle")} className={SECTION}>
        <h2 className={SECTION_HEADING}>{t("detail.shippingTitle")}</h2>
        <p className={SECTION_TEXT}>{t("detail.receiver", { name: order.receiverName })}</p>
        <p className={SECTION_TEXT}>{t("detail.phone", { phone: order.receiverPhone })}</p>
        <p className={SECTION_TEXT}>{t("detail.address", { address: order.shippingAddress })}</p>
        {order.note && <p className={SECTION_TEXT}>{t("detail.note", { note: order.note })}</p>}
        <p className={SECTION_TEXT}>
          {t("detail.paymentMethod", { method: order.paymentMethod })}
        </p>
      </section>

      <section aria-label={t("detail.itemsSectionAria")} className={SECTION}>
        <h2 className={SECTION_HEADING}>{t("detail.itemsTitle")}</h2>
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
                {t("detail.item", {
                  name: item.productName,
                  color: item.color,
                  size: item.size,
                  quantity: item.quantity,
                })}
              </span>
              <span className="shrink-0 font-semibold text-text">
                {formatPriceVnd(item.subtotal)}
              </span>
            </li>
          ))}
        </ul>
        <p className="pt-1 text-[1.05rem] text-text-secondary">
          {t("detail.total")}{" "}
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
            {isCancelling ? t("detail.cancelling") : t("detail.cancel")}
          </button>
          {cancelError && (
            <p role="alert" className="my-[1em] text-[#a92828]">
              {cancelError}
            </p>
          )}
          {/* Server-side 422 details are English text authored by the backend (FR5 fallback). */}
          {Object.values(cancelFieldErrors)
            .flat()
            .map((message) => (
              <span key={message} role="alert" className="field-error">
                {message}
              </span>
            ))}
        </div>
      )}
    </article>
  );
}
