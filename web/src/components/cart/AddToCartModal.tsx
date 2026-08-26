"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { addCartItem, useApiError } from "@/lib/api";
import { dispatchCartChange } from "@/hooks/useCart";
import { useProduct } from "@/hooks/useProduct";
import { getAccessToken } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getColorSwatch } from "@/lib/format/color";
import type { Product } from "@/types/product";

// Matches order-service's MAX_QUANTITY (99) — see
// order-service/app/services/cart_service.py:14.
const MAX_ITEM_QUANTITY = 99;
const MIN_ITEM_QUANTITY = 1;

const MODAL_SECTION_LABEL =
  "mb-[0.6rem] text-[0.78rem] font-semibold tracking-[0.06em] uppercase text-text-muted";
const STEPPER_BUTTON =
  "inline-flex h-[34px] w-[34px] cursor-pointer items-center justify-center border-0 bg-transparent font-body text-[1rem] font-semibold text-text enabled:hover:bg-[rgba(201,123,74,0.1)] enabled:hover:text-accent-dark disabled:cursor-not-allowed disabled:opacity-40";
// The colour swatch and the size button both carry their selected state as an explicit branch
// (border/background are set by exactly one of the two arms) rather than by stacking a modifier
// class on top of the base one.
const SWATCH =
  "inline-block h-7 w-7 cursor-pointer rounded-full border-2 p-0 transition-[border-color,transform] duration-[180ms] ease-in-out hover:-translate-y-px";
const SWATCH_SELECTED = "border-text shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-text)]";

interface AddToCartModalProps {
  product: Product;
  onClose: () => void;
}

// Shared color/size/quantity picker popup (FR7/T13), reused from ProductCard, ProductDetailPage
// and TryOnPage — since AddCartItemRequest needs a specific variantId, this is the only place
// that resolves color+size back to a variant.
function sizesFor(product: Product, color: string): string[] {
  return [
    ...new Set(
      product.variants.filter((variant) => variant.color === color).map((variant) => variant.size),
    ),
  ];
}

export function AddToCartModal({ product, onClose }: AddToCartModalProps) {
  const t = useTranslations("cart.addModal");
  const tCommon = useTranslations("common");
  const translateError = useApiError();
  const colors = [...new Set(product.variants.map((variant) => variant.color))];

  // A product with only one color (or, once a color is picked, only one size) has nothing to
  // actually choose — auto-pick it so the user isn't blocked on clicking a swatch/button that
  // looks like a static indicator rather than a control. It's still rendered (and shown as
  // selected, via the selected swatch/button styling) so the choice stays visible, not hidden.
  const [selectedColor, setSelectedColor] = useState<string | null>(() =>
    colors.length === 1 ? colors[0] : null,
  );
  const [selectedSize, setSelectedSize] = useState<string | null>(() => {
    if (colors.length !== 1) return null;
    const sizes = sizesFor(product, colors[0]);
    return sizes.length === 1 ? sizes[0] : null;
  });
  const [quantity, setQuantity] = useState(MIN_ITEM_QUANTITY);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sizesForColor = selectedColor ? sizesFor(product, selectedColor) : [];

  const selectedVariant =
    selectedColor && selectedSize
      ? product.variants.find(
          (candidate) => candidate.color === selectedColor && candidate.size === selectedSize,
        )
      : null;

  // Stock changes with every checkout elsewhere, so the `product` prop (which may have been
  // fetched well before this modal opened, e.g. from the catalog list) can't be trusted for it —
  // re-fetch GET /products/:id fresh on open to get a live `variant.stock` (product-service
  // computes `quantity - reservedQuantity` from ps_inventory on every call, see
  // ProductVariantResponseDto).
  const {
    product: liveProduct,
    isLoading: isCheckingStock,
    error: stockCheckError,
  } = useProduct(product.id);
  const liveVariant = selectedVariant
    ? liveProduct?.variants.find((candidate) => candidate.id === selectedVariant.id)
    : undefined;
  const stock = liveVariant?.stock ?? null;
  const isOutOfStock = stock !== null && stock <= 0;
  const maxQuantity = stock !== null ? Math.min(MAX_ITEM_QUANTITY, Math.max(stock, 0)) : MAX_ITEM_QUANTITY;

  // Derived, not stored — clamps down if the selected variant's stock is lower than what's
  // already dialed in (e.g. switching from a size with plenty of stock to one with only a couple
  // left), while remembering the user's original intent if they switch back to a roomier variant.
  const clampedQuantity = Math.max(MIN_ITEM_QUANTITY, Math.min(quantity, maxQuantity));

  function handleSelectColor(color: string) {
    setSelectedColor(color);
    const sizes = sizesFor(product, color);
    setSelectedSize(sizes.length === 1 ? sizes[0] : null);
    setValidationError(null);
  }

  function handleSelectSize(size: string) {
    setSelectedSize(size);
    setValidationError(null);
  }

  function handleStepQuantity(delta: number) {
    setQuantity((current) =>
      Math.min(maxQuantity, Math.max(MIN_ITEM_QUANTITY, current + delta)),
    );
  }

  async function handleConfirm() {
    if (!selectedColor || !selectedSize) {
      setValidationError(t("errorSelectColorAndSize"));
      return;
    }

    if (!selectedVariant) {
      setValidationError(t("errorVariantNotFound"));
      return;
    }

    if (isCheckingStock) {
      setValidationError(t("errorCheckingStock"));
      return;
    }

    if (isOutOfStock) {
      setValidationError(t("errorOutOfStock"));
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setSubmitError(t("errorLoginRequired"));
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await addCartItem(token, {
        productId: product.id,
        variantId: selectedVariant.id,
        quantity: clampedQuantity,
      });
      dispatchCartChange();
      onClose();
    } catch (err) {
      setSubmitError(translateError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="animate-account-menu-in fixed inset-0 z-[200] grid place-items-center bg-[rgba(43,36,32,0.45)] p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100vh-3rem)] w-[min(100%,480px)] overflow-y-auto rounded-[18px] border border-border bg-surface p-[clamp(1.25rem,3vw,1.75rem)] shadow-[0_20px_50px_rgba(43,36,32,0.16)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-to-cart-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 id="add-to-cart-heading" className="font-heading text-[1.3rem] text-text">
            {t("title")}
          </h2>
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-[1.4rem] leading-none text-text-muted hover:bg-[rgba(43,36,32,0.06)] hover:text-text"
            onClick={onClose}
            aria-label={tCommon("close")}
          >
            ×
          </button>
        </div>

        <p className="mb-5 text-[0.95rem] font-semibold text-text-secondary">{product.name}</p>

        <section aria-label={t("colorSectionAria")} className="mb-5">
          <p className={MODAL_SECTION_LABEL}>{t("colorLabel")}</p>
          {colors.length === 0 ? (
            <p className="my-[1em]">{t("noColors")}</p>
          ) : (
            <ul className="mb-6 flex flex-wrap gap-3">
              {colors.map((color) => {
                // AC6/AC13: prefer a real variant's colorHex; fall back to the legacy name->hex
                // lookup when no variant of this color has one set yet.
                const variantOfColor = product.variants.find((variant) => variant.color === color);
                const legacySwatch = getColorSwatch(color);
                const hex = variantOfColor?.colorHex ?? legacySwatch.hex;
                const isSelected = color === selectedColor;
                return (
                  <li key={color} className="flex items-center gap-[0.4rem]">
                    <button
                      type="button"
                      className={cn(SWATCH, isSelected ? SWATCH_SELECTED : "border-border")}
                      style={{ backgroundColor: hex }}
                      aria-pressed={isSelected}
                      aria-label={color}
                      title={color}
                      onClick={() => handleSelectColor(color)}
                    />
                    <span className="text-[0.8rem] text-text-secondary">{color}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {selectedColor && (
          <section aria-label={t("sizeSectionAria")} className="mb-5">
            <p className={MODAL_SECTION_LABEL}>{t("sizeLabel")}</p>
            <ul className="flex flex-wrap gap-2">
              {sizesForColor.map((size) => (
                <li key={size}>
                  <button
                    type="button"
                    className={cn(
                      "btn btn-small",
                      size === selectedSize ? "border-text bg-text text-surface" : "btn-outline",
                    )}
                    aria-pressed={size === selectedSize}
                    onClick={() => handleSelectSize(size)}
                  >
                    {size}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label={t("quantityLabel")} className="mb-5">
          <p className={MODAL_SECTION_LABEL}>{t("quantityLabel")}</p>
          <div className="inline-flex items-center overflow-hidden rounded-[10px] border border-border bg-[#fffdf9]">
            <button
              type="button"
              className={STEPPER_BUTTON}
              onClick={() => handleStepQuantity(-1)}
              disabled={clampedQuantity <= MIN_ITEM_QUANTITY}
              aria-label={t("decreaseQuantityAria")}
            >
              −
            </button>
            <span
              aria-live="polite"
              className="inline-flex min-w-[2rem] items-center justify-center text-[0.9rem] font-semibold text-text"
            >
              {clampedQuantity}
            </span>
            <button
              type="button"
              className={STEPPER_BUTTON}
              onClick={() => handleStepQuantity(1)}
              disabled={clampedQuantity >= maxQuantity}
              aria-label={t("increaseQuantityAria")}
            >
              +
            </button>
          </div>

          {selectedVariant && isCheckingStock && (
            <p className="mt-[0.6rem] text-[0.82rem] text-text-muted">{t("checkingStock")}</p>
          )}
          {selectedVariant && !isCheckingStock && stockCheckError && (
            <p role="alert" className="my-[1em] text-[#a92828]">
              {stockCheckError}
            </p>
          )}
          {selectedVariant && !isCheckingStock && !stockCheckError && stock !== null && (
            <p
              role={isOutOfStock ? "alert" : undefined}
              className={cn(
                isOutOfStock ? "text-[#a92828]" : "mt-[0.6rem] text-[0.82rem] text-text-muted",
              )}
            >
              {isOutOfStock ? t("outOfStock") : t("stockLeft", { count: stock })}
            </p>
          )}
        </section>

        {validationError && (
          <p role="alert" className="my-[1em] text-[#a92828]">
            {validationError}
          </p>
        )}
        {submitError && (
          <p role="alert" className="my-[1em] text-[#a92828]">
            {submitError}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            className="btn btn-outline flex-1"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary flex-1"
            onClick={handleConfirm}
            disabled={isSubmitting || Boolean(selectedVariant && (isCheckingStock || isOutOfStock))}
          >
            {isSubmitting ? t("submitting") : t("submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
