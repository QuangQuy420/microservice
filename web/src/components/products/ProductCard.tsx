import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { AddToCartModal } from "@/components/cart/AddToCartModal";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { formatPriceVnd } from "@/lib/format/price";
import { useLabels } from "@/lib/labels";
import type { Product } from "@/types/product";

// The card image doubles as its own "no image / broken image" placeholder — same flat grey box
// either way, so ImageWithFallback gets the one class string for both states.
const CARD_IMAGE_CLASS = "aspect-square w-full bg-[#f0f0f0] object-contain";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const t = useTranslations("products");
  const labels = useLabels();
  const thumbnail = product.images.find((image) => image.isThumbnail) ?? product.images[0];
  const [isAddToCartOpen, setIsAddToCartOpen] = useState(false);

  return (
    <div className="flex flex-col overflow-hidden rounded-[6px] border border-border bg-surface">
      <Link href={`/products/${product.id}`} className="block text-inherit no-underline">
        {thumbnail ? (
          <ImageWithFallback
            src={thumbnail.imageUrl}
            alt={product.name}
            className={CARD_IMAGE_CLASS}
            placeholderClassName={CARD_IMAGE_CLASS}
          />
        ) : (
          <div className={CARD_IMAGE_CLASS} />
        )}
        <div className="px-4 pt-4">
          <h3 className="mb-1 font-heading text-[1.05rem] font-semibold text-text">{product.name}</h3>
          <p className="mb-[0.6rem] text-[0.85rem] text-text-muted">{labels.frameShape(product.frameShape)}</p>
          <p className="text-base font-semibold">{formatPriceVnd(product.basePrice)}</p>
        </div>
      </Link>
      <div className="mt-auto flex gap-2 px-4 pt-[0.9rem] pb-4">
        <Link
          href={`/products/${product.id}/try-on`}
          className="btn btn-primary btn-small"
          aria-label={t("tryOnAr")}
        >
          {t("tryOnAr")}
        </Link>
        <button
          type="button"
          className="btn btn-outline btn-small"
          onClick={() => setIsAddToCartOpen(true)}
          aria-label={t("addToCart")}
        >
          {t("addToCart")}
        </button>
      </div>

      {isAddToCartOpen && (
        <AddToCartModal product={product} onClose={() => setIsAddToCartOpen(false)} />
      )}
    </div>
  );
}
