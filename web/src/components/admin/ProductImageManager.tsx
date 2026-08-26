"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  deleteProductImage,
  setProductImageThumbnail,
  uploadProductImage,
  useApiError,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import type { ProductImage } from "@/types/product";

const IMAGE = "block aspect-square w-full object-contain";

interface ProductImageManagerProps {
  productId: string | null;
  // null manages the base product's own image group; a variant id manages that variant's own
  // image group — the two groups are independent (see product-service's per-(productId,
  // variantId) sortOrder/limit grouping).
  variantId: string | null;
  images: ProductImage[];
  maxCount: number;
  onChange: (next: ProductImage[]) => void;
}

// Multi-image manager (T23): replaces the old 4-fixed-slot ImageUploadSlot. Renders the current
// images for one group (append-only, never replaced), each with its own "set as thumbnail"/
// "delete" actions, plus a multi-file upload input that uploads sequentially and stops
// client-side once `maxCount` is reached. Disabled until `productId` exists — uploads attach to
// an existing product/variant, a brand-new one has no id yet.
export function ProductImageManager({
  productId,
  variantId,
  images,
  maxCount,
  onChange,
}: ProductImageManagerProps) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const translateError = useApiError();
  const [imageList, setImageList] = useState<ProductImage[]>(images);
  const [isUploading, setIsUploading] = useState(false);
  const [busyImageId, setBusyImageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isFull = imageList.length >= maxCount;
  const isUploadDisabled = !productId || isUploading || isFull;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0 || !productId) return;

    const token = getAccessToken();
    if (!token) {
      setError(t("images.sessionExpired"));
      return;
    }

    setError(null);
    setIsUploading(true);
    let count = imageList.length;
    let blocked = false;
    try {
      for (const file of files) {
        if (count >= maxCount) {
          blocked = true;
          break;
        }
        const uploaded = await uploadProductImage(productId, file, token, variantId ?? undefined);
        count += 1;
        setImageList((current) => {
          const next = [...current, uploaded];
          onChange(next);
          return next;
        });
      }
      if (blocked) {
        setError(t("images.limitReachedUpload", { max: maxCount }));
      }
    } catch (err) {
      setError(translateError(err));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSetThumbnail(imageId: string) {
    if (!productId) return;
    const token = getAccessToken();
    if (!token) {
      setError(t("images.sessionExpired"));
      return;
    }

    setError(null);
    setBusyImageId(imageId);
    try {
      await setProductImageThumbnail(productId, imageId, token);
      setImageList((current) => {
        const next = current.map((image) => ({ ...image, isThumbnail: image.id === imageId }));
        onChange(next);
        return next;
      });
    } catch (err) {
      setError(translateError(err));
    } finally {
      setBusyImageId(null);
    }
  }

  async function handleDelete(imageId: string) {
    if (!productId) return;
    const token = getAccessToken();
    if (!token) {
      setError(t("images.sessionExpired"));
      return;
    }

    setError(null);
    setBusyImageId(imageId);
    try {
      await deleteProductImage(productId, imageId, token);
      setImageList((current) => {
        const next = current.filter((image) => image.id !== imageId);
        onChange(next);
        return next;
      });
    } catch (err) {
      setError(translateError(err));
    } finally {
      setBusyImageId(null);
    }
  }

  return (
    <div>
      {imageList.length > 0 && (
        <ul className="mb-3 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {imageList.map((image) => (
            <li
              key={image.id}
              className="relative overflow-hidden rounded-lg border border-border bg-[image:repeating-linear-gradient(135deg,#ede6d8,#ede6d8_12px,#e4dbc9_12px,#e4dbc9_24px)]"
            >
              <ImageWithFallback
                src={image.imageUrl}
                alt={t("images.imageAlt")}
                className={IMAGE}
                placeholderClassName={IMAGE}
              />
              {image.isThumbnail && (
                <span className="absolute top-[0.4rem] left-[0.4rem] rounded-full bg-text px-[0.45rem] py-[0.15rem] text-[0.7rem] font-semibold text-surface">
                  {t("images.thumbnailBadge")}
                </span>
              )}
              <div className="flex flex-col gap-[0.35rem] p-2">
                <button
                  type="button"
                  className="btn btn-outline btn-small"
                  onClick={() => handleSetThumbnail(image.id)}
                  disabled={image.isThumbnail || busyImageId === image.id}
                >
                  {t("images.setThumbnail")}
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-small"
                  onClick={() => handleDelete(image.id)}
                  disabled={busyImageId === image.id}
                >
                  {tCommon("delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <label
        className={cn(
          "relative inline-flex items-center justify-center rounded-lg border border-dashed border-border px-[0.9rem] py-2 text-[0.85rem] text-text-secondary",
          isUploadDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        )}
      >
        <span>{isUploading ? t("images.uploading") : t("images.upload")}</span>
        <input
          type="file"
          className={cn(
            "absolute inset-0 opacity-0",
            isUploadDisabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={isUploadDisabled}
          onChange={handleFileChange}
          aria-label={t("images.upload")}
        />
      </label>
      {isFull && (
        <p className="text-xs text-text-muted">{t("images.limitReached", { max: maxCount })}</p>
      )}
      {error && <p className="field-error my-[1em]">{error}</p>}
    </div>
  );
}
