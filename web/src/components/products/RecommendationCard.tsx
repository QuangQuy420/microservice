"use client";

import Link from "next/link";
import { useState } from "react";
import { AddToCartModal } from "@/components/cart/AddToCartModal";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { ApiError, getProductById } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatPriceVnd } from "@/lib/format/price";
import { formatFrameShapeVi } from "@/lib/labels";
import type { Product } from "@/types/product";
import type { RecommendedProduct } from "@/types/recommendation";

// "compact" is the face-analysis variant: the cards sit in the narrow result-layout sidebar
// (~280-340px, capped to the photo column's height), so each one becomes a thumbnail+text row
// instead of the wide vertical card. This used to be a descendant-selector override scoped to
// the face-analysis preview wrapper; it is an explicit prop now so nothing depends on the
// cascade. Passed down by RecommendationGrid — see RecommendationGrid.tsx.
export type RecommendationCardVariant = "default" | "compact";

interface RecommendationCardProps {
  product: RecommendedProduct;
  // Present only on the face-analysis page (RecommendationPreview → RecommendationGrid), where a
  // second "Thử lên ảnh này" action draws the frame onto the already-uploaded static photo. In
  // that context the primary action is "Thêm vào giỏ hàng" instead of the live-camera "Thử kính
  // AR" — /recommendations (onTryOnPhoto absent) keeps the AR action instead.
  onTryOnPhoto?: (product: RecommendedProduct) => void;
  variant?: RecommendationCardVariant;
}

// Same card-style layout as ProductCard, but built for RecommendedProduct's narrower shape
// (no genderTarget/category/variants — recommendation-service only returns what a card needs
// plus a ranking `score`), so ProductCard itself isn't reused directly.
export function RecommendationCard({
  product,
  onTryOnPhoto,
  variant = "default",
}: RecommendationCardProps) {
  const thumbnail = product.images.find((image) => image.isThumbnail) ?? product.images[0];
  const isCompact = variant === "compact";

  // The image doubles as its own "no image / broken image" placeholder — same flat grey box
  // either way, so ImageWithFallback gets the one class string for both states.
  const imageClass = cn(
    "aspect-square bg-[#f0f0f0] object-contain",
    isCompact ? "h-16 w-16 shrink-0 rounded-[6px]" : "w-full",
  );

  // AddToCartModal needs variants (for color/size selection), which RecommendedProduct doesn't
  // carry — fetch the full Product on demand when the user actually asks to add to cart, rather
  // than widening recommendation-service's response for every recommendation just for this.
  const [fullProduct, setFullProduct] = useState<Product | null>(null);
  const [isAddToCartOpen, setIsAddToCartOpen] = useState(false);
  const [isFetchingProduct, setIsFetchingProduct] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function handleAddToCartClick() {
    setFetchError(null);
    if (fullProduct) {
      setIsAddToCartOpen(true);
      return;
    }
    setIsFetchingProduct(true);
    try {
      const fetched = await getProductById(product.id);
      setFullProduct(fetched);
      setIsAddToCartOpen(true);
    } catch (err) {
      setFetchError(err instanceof ApiError ? err.message : "Không thể tải thông tin sản phẩm.");
    } finally {
      setIsFetchingProduct(false);
    }
  }

  return (
    <div
      className={cn(
        "flex overflow-hidden border border-border bg-surface",
        isCompact ? "flex-row flex-wrap rounded-lg p-[0.625rem]" : "flex-col rounded-[6px]",
      )}
    >
      <Link
        href={`/products/${product.id}`}
        className={cn(
          "text-inherit no-underline",
          isCompact ? "flex w-full gap-3" : "block",
        )}
      >
        {thumbnail ? (
          <ImageWithFallback
            src={thumbnail.imageUrl}
            alt={product.name}
            className={imageClass}
            placeholderClassName={imageClass}
          />
        ) : (
          <div className={imageClass} />
        )}
        <div className={isCompact ? "min-w-0 p-0" : "px-4 pt-4"}>
          <h3
            className={cn(
              "font-heading font-semibold text-text",
              isCompact
                ? "mb-[0.15rem] overflow-hidden text-ellipsis whitespace-nowrap text-[0.85rem]"
                : "mb-1 text-[1.05rem]",
            )}
          >
            {product.name}
          </h3>
          <p
            className={cn(
              "text-text-muted",
              isCompact ? "mb-1 text-[0.72rem]" : "mb-[0.6rem] text-[0.85rem]",
            )}
          >
            {formatFrameShapeVi(product.frameShape)}
          </p>
          <p className={cn("font-semibold", isCompact ? "text-[0.82rem]" : "text-base")}>
            {formatPriceVnd(product.basePrice)}
          </p>
        </div>
      </Link>
      <div
        className={cn(
          "mt-auto flex",
          isCompact ? "gap-[0.4rem] px-0 pt-2 pb-0" : "gap-2 px-4 pt-[0.9rem] pb-4",
        )}
      >
        {onTryOnPhoto ? (
          <>
            <button
              type="button"
              className="btn btn-outline btn-small"
              onClick={() => onTryOnPhoto(product)}
            >
              Thử lên ảnh này
            </button>
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={handleAddToCartClick}
              disabled={isFetchingProduct}
            >
              {isFetchingProduct ? "Đang tải..." : "Thêm vào giỏ hàng"}
            </button>
          </>
        ) : (
          <Link href={`/products/${product.id}/try-on`} className="btn btn-primary btn-small">
            Thử kính AR
          </Link>
        )}
      </div>
      {fetchError && (
        <p role="alert" className="my-[1em] text-[#a92828]">
          {fetchError}
        </p>
      )}

      {isAddToCartOpen && fullProduct && (
        <AddToCartModal product={fullProduct} onClose={() => setIsAddToCartOpen(false)} />
      )}
    </div>
  );
}
