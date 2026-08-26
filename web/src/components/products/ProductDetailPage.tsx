"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { AddToCartModal } from "@/components/cart/AddToCartModal";
import { ErrorState } from "@/components/common/ErrorState";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { LoadingState } from "@/components/common/LoadingState";
import { useProduct } from "@/hooks/useProduct";
import { cn } from "@/lib/cn";
import { getColorSwatch } from "@/lib/format/color";
import { formatPriceVnd } from "@/lib/format/price";
import { useLabels } from "@/lib/labels";

// The gallery images double as their own "no image / broken image" placeholder — same flat
// grey box either way, so ImageWithFallback gets the one class string for both states.
const MAIN_IMAGE_CLASS = "mb-3 aspect-square w-full rounded-lg bg-[#f0f0f0] object-contain";
const THUMBNAIL_CLASS = "aspect-square w-full rounded-[6px] bg-[#f0f0f0] object-contain";

// Both detail-page buttons stretch to fill the action row.
const DETAIL_ACTION_CLASS = "flex-1 min-w-40";

interface ProductDetailPageProps {
  id: string;
}

export function ProductDetailPage({ id }: ProductDetailPageProps) {
  const t = useTranslations("products");
  const labels = useLabels();
  const { product, isLoading, error } = useProduct(id);
  const [isAddToCartOpen, setIsAddToCartOpen] = useState(false);
  // FR6/AC7: which swatch the customer picked, if any — drives which image group is shown below.
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  if (isLoading) return <LoadingState label={t("loading")} />;
  if (error) return <ErrorState message={error} />;
  if (!product) return <ErrorState message={t("notFound")} />;

  // FR7: one swatch per distinct variant.color, in first-seen order — colorHex takes priority
  // over the legacy name->hex lookup (AC13: colorHex null falls back to getColorSwatch).
  const colors: { color: string; hex: string; isKnown: boolean }[] = [];
  const seenColors = new Set<string>();
  for (const variant of product.variants) {
    if (seenColors.has(variant.color)) continue;
    seenColors.add(variant.color);
    const swatch = variant.colorHex
      ? { hex: variant.colorHex, isKnown: true }
      : getColorSwatch(variant.color);
    colors.push({ color: variant.color, hex: swatch.hex, isKnown: swatch.isKnown });
  }

  // FR6/AC7: when a color is selected, prefer images belonging to a variant of that color;
  // fall back to the base product's own images (variantId === null) when that variant has none.
  const selectedVariantIds = selectedColor
    ? new Set(
        product.variants
          .filter((variant) => variant.color === selectedColor)
          .map((variant) => variant.id),
      )
    : null;
  const variantImages = selectedVariantIds
    ? product.images.filter(
        (image) => image.variantId !== null && selectedVariantIds.has(image.variantId),
      )
    : [];
  const baseImages = product.images.filter((image) => image.variantId === null);
  const activeImages = variantImages.length > 0 ? variantImages : baseImages;

  const sortedImages = [...activeImages].sort((a, b) => a.sortOrder - b.sortOrder);
  const mainImage = activeImages.find((image) => image.isThumbnail) ?? sortedImages[0];
  const thumbnailImages = sortedImages.filter((image) => image.id !== mainImage?.id);

  return (
    <article aria-labelledby="product-heading">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-[0.9rem] font-medium text-text no-underline"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        {t("detail.back")}
      </Link>

      <div className="flex flex-wrap gap-10">
        <section aria-label={t("detail.imagesLabel")} className="min-w-[260px] flex-[1_1_380px]">
          {sortedImages.length === 0 ? (
            <p className="my-[1em]">{t("detail.noImages")}</p>
          ) : (
            <>
              {mainImage && (
                <ImageWithFallback
                  src={mainImage.imageUrl}
                  alt={product.name}
                  className={MAIN_IMAGE_CLASS}
                  placeholderClassName={MAIN_IMAGE_CLASS}
                />
              )}
              {thumbnailImages.length > 0 && (
                <ul className="m-0 grid list-none grid-cols-3 gap-[0.6rem] p-0">
                  {thumbnailImages.map((image) => (
                    <li key={image.id}>
                      <ImageWithFallback
                        src={image.imageUrl}
                        alt={product.name}
                        className={THUMBNAIL_CLASS}
                        placeholderClassName={THUMBNAIL_CLASS}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <div className="min-w-[260px] flex-[1_1_340px]">
          {/* The heading had no rule of its own and relied on the browser defaults that
              Tailwind's preflight removes — restated here so it keeps its old size. */}
          <h1 id="product-heading" className="my-[0.67em] text-[2em] font-bold">
            {product.name}
          </h1>
          <p className="mb-4 text-[0.9rem] text-text-muted">{labels.frameShape(product.frameShape)}</p>
          <p className="mb-5 text-2xl font-semibold">{formatPriceVnd(product.basePrice)}</p>
          {product.description && (
            <p className="mb-6 text-[0.95rem] leading-[1.65] text-text-secondary">{product.description}</p>
          )}

          {/* FR7 focuses on the swatch row replacing the old variant list; brand/category/
              gender/material aren't in the design mock but nothing calls for dropping them, so
              they're kept as a compact secondary attributes list (same conservative call as the
              plan's own Q6 on the footer copyright line). */}
          <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.85rem] text-text-secondary">
            <dt className="font-semibold text-text-muted">{t("detail.brand")}</dt>
            <dd>{product.brand.name}</dd>
            <dt className="font-semibold text-text-muted">{t("detail.category")}</dt>
            <dd>{product.category.name}</dd>
            <dt className="font-semibold text-text-muted">{t("detail.gender")}</dt>
            <dd>{labels.genderTarget(product.genderTarget)}</dd>
            {product.material && (
              <>
                <dt className="font-semibold text-text-muted">{t("detail.material")}</dt>
                <dd>{product.material}</dd>
              </>
            )}
          </dl>

          <section aria-label={t("detail.colorsLabel")}>
            <p className="mb-[0.6rem] text-[0.8rem] font-semibold tracking-[0.06em] text-text-muted uppercase">
              {t("detail.frameColor")}
            </p>
            {colors.length === 0 ? (
              <p className="my-[1em]">{t("detail.noColors")}</p>
            ) : (
              <ul className="mb-6 flex list-none flex-wrap gap-3 p-0">
                {colors.map(({ color, hex, isKnown }) => {
                  const isSelected = color === selectedColor;
                  return (
                    <li key={color} className="flex items-center gap-[0.4rem]">
                      <button
                        type="button"
                        className={cn(
                          "inline-block h-7 w-7 cursor-pointer rounded-full border-2 p-0",
                          "transition-[border-color,translate] duration-[180ms] ease-[ease]",
                          "hover:-translate-y-px",
                          isSelected
                            ? "border-text shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-text)]"
                            : "border-border",
                        )}
                        style={{ backgroundColor: hex }}
                        aria-pressed={isSelected}
                        aria-label={color}
                        title={color}
                        onClick={() => setSelectedColor(isSelected ? null : color)}
                      />
                      {!isKnown && <span className="text-[0.8rem] text-text-secondary">{color}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/products/${product.id}/try-on`}
              className={cn("btn btn-primary", DETAIL_ACTION_CLASS)}
              aria-label={t("tryOnAr")}
            >
              {t("tryOnAr")}
            </Link>
            <button
              type="button"
              className={cn("btn btn-outline", DETAIL_ACTION_CLASS)}
              onClick={() => setIsAddToCartOpen(true)}
              aria-label={t("addToCart")}
            >
              {t("addToCart")}
            </button>
          </div>
        </div>
      </div>

      {isAddToCartOpen && (
        <AddToCartModal product={product} onClose={() => setIsAddToCartOpen(false)} />
      )}
    </article>
  );
}
