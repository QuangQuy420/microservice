"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/ErrorState";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { LoadingState } from "@/components/common/LoadingState";
import { dispatchCartChange, useCart } from "@/hooks/useCart";
import { removeCartItem, updateCartItem, useApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { getColorSwatch } from "@/lib/format/color";
import { formatPriceVnd } from "@/lib/format/price";

// Shared class strings for the pieces that repeat inside the item list — kept as consts so the
// image/placeholder pair and the two stepper buttons can't drift apart.
const CART_ITEM_IMAGE =
  "h-[84px] w-[84px] rounded-lg bg-[#f0f0f0] object-contain max-[700px]:h-16 max-[700px]:w-16 max-[700px]:[grid-area:image]";
const CART_ITEM_IMAGE_PLACEHOLDER = `${CART_ITEM_IMAGE} bg-[repeating-linear-gradient(135deg,#ede6d8,#ede6d8_12px,#e4dbc9_12px,#e4dbc9_24px)]`;
const STEPPER_BUTTON =
  "inline-flex h-[34px] w-[34px] cursor-pointer items-center justify-center border-0 bg-transparent font-body text-[1rem] font-semibold text-text enabled:hover:bg-[rgba(201,123,74,0.1)] enabled:hover:text-accent-dark disabled:cursor-not-allowed disabled:opacity-40";

// FR1/T16: list cart items, let the user change quantity or remove an item, show the running
// total, and lead into checkout. Cart CRUD is done here directly (not via AddToCartModal, which
// only handles the initial add) so it can dispatch "cart-change" the same way after every
// mutation, keeping the Header badge and this page's own useCart() in sync.
//
// T-checkout-select: checkout is per-selection, not "always the whole cart" — the user ticks
// which items to pay for, the total only reflects those, and the checkout button carries the
// selected variantIds to /checkout via the query string (CheckoutPage reads them back out;
// order-service only ever sees the selected subset, see CheckoutPayload.variantIds).
export function CartPage() {
  const t = useTranslations("cart");
  const translateError = useApiError();
  const { cart, isLoading, error, refetch } = useCart();
  const [mutatingVariantId, setMutatingVariantId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());

  function toggleSelected(variantId: string) {
    setSelectedVariantIds((current) => {
      const next = new Set(current);
      if (next.has(variantId)) {
        next.delete(variantId);
      } else {
        next.add(variantId);
      }
      return next;
    });
  }

  async function handleUpdateQuantity(variantId: string, quantity: number) {
    const token = getAccessToken();
    if (!token || quantity < 1) return;

    setMutatingVariantId(variantId);
    setMutationError(null);
    try {
      await updateCartItem(token, variantId, { quantity });
      dispatchCartChange();
      await refetch();
    } catch (err) {
      setMutationError(translateError(err));
    } finally {
      setMutatingVariantId(null);
    }
  }

  async function handleRemove(variantId: string) {
    const token = getAccessToken();
    if (!token) return;

    setMutatingVariantId(variantId);
    setMutationError(null);
    try {
      await removeCartItem(token, variantId);
      dispatchCartChange();
      await refetch();
    } catch (err) {
      setMutationError(translateError(err));
    } finally {
      setMutatingVariantId(null);
    }
  }

  if (isLoading) return <LoadingState label={t("loading")} />;
  if (error) return <ErrorState message={error} />;

  const items = cart?.items ?? [];

  const selectedItems = items.filter((item) => selectedVariantIds.has(item.variantId));
  const selectedTotal = selectedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const selectedCount = selectedItems.length;
  const allSelected = items.length > 0 && selectedCount === items.length;

  function toggleSelectAll() {
    setSelectedVariantIds(
      allSelected ? new Set() : new Set(items.map((item) => item.variantId)),
    );
  }

  return (
    <section
      aria-labelledby="cart-heading"
      className="mx-auto max-w-[1050px] py-[clamp(1.5rem,4vw,3rem)]"
    >
      <h1 id="cart-heading" className="mb-5 font-heading text-[clamp(1.75rem,3vw,2.25rem)] text-text">
        {t("title")}
      </h1>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-[clamp(1.5rem,4vw,2.5rem)] text-center text-text-muted">
          {t("empty")}
        </p>
      ) : (
        <>
          {mutationError && (
            <p role="alert" className="my-[1em] text-[#a92828]">
              {mutationError}
            </p>
          )}

          <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-[0.9rem] text-text-secondary">
            <input
              type="checkbox"
              className="h-[18px] w-[18px] cursor-pointer"
              checked={allSelected}
              onChange={toggleSelectAll}
              aria-label={t("selectAllAria")}
            />
            {t("selectAll")}
          </label>

          <ul className="mb-6 flex flex-col gap-4">
            {items.map((item) => (
              <li
                key={item.variantId}
                className="grid grid-cols-[auto_84px_1fr_auto_auto_auto] items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-[0_10px_26px_rgba(43,36,32,0.05)] max-[700px]:grid-cols-[auto_64px_1fr] max-[700px]:gap-y-3 max-[700px]:[grid-template-areas:'checkbox_image_info'_'checkbox_stepper_stepper'_'checkbox_subtotal_remove']"
              >
                <input
                  type="checkbox"
                  className="h-[18px] w-[18px] cursor-pointer max-[700px]:[grid-area:checkbox]"
                  checked={selectedVariantIds.has(item.variantId)}
                  onChange={() => toggleSelected(item.variantId)}
                  aria-label={t("selectItemAria", { name: item.productName })}
                />

                {item.productImageUrl ? (
                  <ImageWithFallback
                    src={item.productImageUrl}
                    alt={item.productName}
                    className={CART_ITEM_IMAGE}
                    placeholderClassName={CART_ITEM_IMAGE_PLACEHOLDER}
                  />
                ) : (
                  <div className={CART_ITEM_IMAGE_PLACEHOLDER} />
                )}

                <div className="min-w-0 max-[700px]:[grid-area:info]">
                  <p className="mb-[0.3rem] font-heading text-[1rem] font-semibold text-text">
                    {item.productName}
                  </p>
                  <p className="mb-[0.3rem] flex items-center gap-[0.4rem] text-[0.82rem] text-text-muted">
                    <span
                      className="inline-block h-[14px] w-[14px] shrink-0 rounded-full border-2 border-border"
                      style={{ backgroundColor: item.colorHex ?? getColorSwatch(item.color).hex }}
                      role="img"
                      aria-label={item.color}
                      title={item.color}
                    />
                    {t("itemColorSize", { color: item.color, size: item.size })}
                  </p>
                  <p className="text-[0.9rem] font-semibold text-text-secondary">
                    {formatPriceVnd(item.unitPrice)}
                  </p>
                </div>

                <div className="inline-flex items-center overflow-hidden rounded-[10px] border border-border bg-[#fffdf9] max-[700px]:justify-self-start max-[700px]:[grid-area:stepper]">
                  <button
                    type="button"
                    className={STEPPER_BUTTON}
                    onClick={() => handleUpdateQuantity(item.variantId, item.quantity - 1)}
                    disabled={mutatingVariantId === item.variantId || item.quantity <= 1}
                    aria-label={t("decreaseQuantityAria", { name: item.productName })}
                  >
                    −
                  </button>
                  <span
                    aria-live="polite"
                    className="inline-flex min-w-[2rem] items-center justify-center text-[0.9rem] font-semibold text-text"
                  >
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    className={STEPPER_BUTTON}
                    onClick={() => handleUpdateQuantity(item.variantId, item.quantity + 1)}
                    disabled={mutatingVariantId === item.variantId || item.quantity >= 99}
                    aria-label={t("increaseQuantityAria", { name: item.productName })}
                  >
                    +
                  </button>
                </div>

                <p className="text-[0.95rem] font-bold whitespace-nowrap text-text max-[700px]:[grid-area:subtotal]">
                  {formatPriceVnd(item.subtotal)}
                </p>

                <button
                  type="button"
                  className="btn btn-outline btn-small max-[700px]:justify-self-end max-[700px]:[grid-area:remove]"
                  onClick={() => handleRemove(item.variantId)}
                  disabled={mutatingVariantId === item.variantId}
                >
                  {t("remove")}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-[clamp(1.2rem,3vw,1.75rem)] py-5 shadow-[0_14px_36px_rgba(43,36,32,0.06)] max-[700px]:flex-col max-[700px]:items-stretch max-[700px]:text-center">
            {selectedCount > 0 ? (
              <p className="text-[1.05rem] text-text-secondary">
                {t("total", { count: selectedCount })}{" "}
                <strong className="text-[1.2rem] text-text">{formatPriceVnd(selectedTotal)}</strong>
              </p>
            ) : (
              <p className="text-[1.05rem] text-text-muted italic">
                {t("selectPrompt")}
              </p>
            )}
            {selectedCount > 0 ? (
              <Link
                href={`/checkout?variantIds=${Array.from(selectedVariantIds)
                  .map(encodeURIComponent)
                  .join(",")}`}
                className="btn btn-primary"
              >
                {t("checkout")}
              </Link>
            ) : (
              <button type="button" className="btn btn-primary" disabled>
                {t("checkout")}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
