"use client";

import { useState } from "react";
import { ApiError, createVariant, deleteVariant, updateVariant } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import type { ProductImage, ProductVariant } from "@/types/product";
import { ProductImageManager } from "./ProductImageManager";

const ROW =
  "grid grid-cols-[1.2fr_0.8fr_1fr_0.8fr_150px] items-start gap-3 px-[1.1rem] py-3 text-inherit no-underline";
const ROW_HEAD =
  "bg-[rgba(43,36,32,0.04)] text-xs font-semibold tracking-[0.05em] text-text-muted uppercase";
const ROW_BODY = "border-t border-[rgba(43,36,32,0.08)] text-sm";
const COLOR_PICKER =
  "h-9 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-[2px]";

interface ProductVariantsEditorProps {
  productId: string | null;
  variants: ProductVariant[];
  images: ProductImage[];
  onChange: (next: ProductVariant[]) => void;
}

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_COLOR_HEX = "#000000";

interface VariantDraft {
  color: string;
  colorHex: string;
  size: string;
  extraPrice: string;
  stock: string;
}

function blankDraft(): VariantDraft {
  return { color: "", colorHex: DEFAULT_COLOR_HEX, size: "", extraPrice: "0", stock: "0" };
}

function draftFromVariant(variant: ProductVariant): VariantDraft {
  return {
    color: variant.color,
    colorHex: variant.colorHex ?? DEFAULT_COLOR_HEX,
    size: variant.size,
    extraPrice: String(variant.extraPrice),
    stock: String(variant.stock ?? 0),
  };
}

/** Returns the parsed payload, or null (after setting `setError`) if the draft is invalid. */
function parseDraft(
  draft: VariantDraft,
  setError: (message: string) => void,
): { color: string; colorHex: string; size: string; extraPrice: number; stock: number } | null {
  const color = draft.color.trim();
  const size = draft.size.trim();
  if (!color || !size) {
    setError("Vui lòng nhập màu sắc và kích thước.");
    return null;
  }
  const colorHex = draft.colorHex.trim();
  if (!HEX_COLOR_PATTERN.test(colorHex)) {
    setError("Mã màu không hợp lệ, vui lòng chọn lại màu.");
    return null;
  }
  const extraPrice = Number(draft.extraPrice);
  if (!Number.isFinite(extraPrice) || extraPrice < 0) {
    setError("Giá thêm không hợp lệ.");
    return null;
  }
  const stock = Number(draft.stock);
  if (!Number.isInteger(stock) || stock < 0) {
    setError("Tồn kho không hợp lệ.");
    return null;
  }
  return { color, colorHex, size, extraPrice, stock };
}

// Variant management (T-web-variants) — color/size/extraPrice/stock for an existing product's
// variants. Disabled until the product has an id (mirrors ImageUploadSlot: a brand-new product
// must be saved first, since variants attach to a real productId).
export function ProductVariantsEditor({
  productId,
  variants,
  images,
  onChange,
}: ProductVariantsEditorProps) {
  if (!productId) {
    return <p className="text-xs text-text-muted">Lưu sản phẩm trước để quản lý biến thể.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className={cn(ROW, ROW_HEAD)}>
          <span>Màu sắc</span>
          <span>Kích thước</span>
          <span>Giá thêm</span>
          <span>Tồn kho</span>
          <span></span>
        </div>
        {variants.map((variant) => (
          <VariantRow
            key={variant.id}
            productId={productId}
            variant={variant}
            images={images.filter((image) => image.variantId === variant.id)}
            onUpdated={(updated) =>
              onChange(variants.map((current) => (current.id === updated.id ? updated : current)))
            }
            onDeleted={(variantId) =>
              onChange(variants.filter((current) => current.id !== variantId))
            }
          />
        ))}
        {variants.length === 0 && (
          <div className="px-[1.1rem] py-10 text-center text-sm text-text-muted">
            Chưa có biến thể nào.
          </div>
        )}
      </div>
      <NewVariantRow
        productId={productId}
        onCreated={(created) => onChange([...variants, created])}
      />
    </div>
  );
}

interface VariantRowProps {
  productId: string;
  variant: ProductVariant;
  images: ProductImage[];
  onUpdated: (updated: ProductVariant) => void;
  onDeleted: (variantId: string) => void;
}

function VariantRow({ productId, variant, images, onUpdated, onDeleted }: VariantRowProps) {
  const [draft, setDraft] = useState<VariantDraft>(draftFromVariant(variant));
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateDraft<K extends keyof VariantDraft>(key: K, value: VariantDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    setError(null);
    const parsed = parseDraft(draft, setError);
    if (!parsed) return;

    const token = getAccessToken();
    if (!token) {
      setError("Vui lòng đăng nhập lại.");
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateVariant(productId, variant.id, parsed, token);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể lưu phiên bản.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setError(null);
    const token = getAccessToken();
    if (!token) {
      setError("Vui lòng đăng nhập lại.");
      return;
    }

    setIsDeleting(true);
    try {
      await deleteVariant(productId, variant.id, token);
      onDeleted(variant.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể xoá phiên bản.");
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col">
      <div className={cn(ROW, ROW_BODY)}>
        <div className="flex items-center gap-[0.4rem]">
          <input
            className="input flex-1"
            value={draft.color}
            onChange={(event) => updateDraft("color", event.target.value)}
            aria-label="Màu sắc"
          />
          <input
            type="color"
            className={COLOR_PICKER}
            value={draft.colorHex}
            onChange={(event) => updateDraft("colorHex", event.target.value)}
            aria-label="Mã màu"
          />
        </div>
        <input
          className="input"
          value={draft.size}
          onChange={(event) => updateDraft("size", event.target.value)}
          aria-label="Kích thước"
        />
        <input
          className="input"
          type="number"
          min="0"
          step="1000"
          value={draft.extraPrice}
          onChange={(event) => updateDraft("extraPrice", event.target.value)}
          aria-label="Giá thêm"
        />
        <input
          className="input"
          type="number"
          min="0"
          step="1"
          value={draft.stock}
          onChange={(event) => updateDraft("stock", event.target.value)}
          aria-label="Tồn kho"
        />
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={handleSave}
            disabled={isSaving || isDeleting}
          >
            {isSaving ? "Đang lưu…" : "Lưu"}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={handleDelete}
            disabled={isSaving || isDeleting}
          >
            {isDeleting ? "Đang xoá…" : "Xoá"}
          </button>
        </div>
        {error && <p className="field-error my-[1em]">{error}</p>}
      </div>
      <div className="px-[1.1rem] pt-3 pb-4">
        <ProductImageManager
          productId={productId}
          variantId={variant.id}
          maxCount={5}
          images={images}
          onChange={() => {}}
        />
      </div>
    </div>
  );
}

interface NewVariantRowProps {
  productId: string;
  onCreated: (created: ProductVariant) => void;
}

function NewVariantRow({ productId, onCreated }: NewVariantRowProps) {
  const [draft, setDraft] = useState<VariantDraft>(blankDraft());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateDraft<K extends keyof VariantDraft>(key: K, value: VariantDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleAdd() {
    setError(null);
    const parsed = parseDraft(draft, setError);
    if (!parsed) return;

    const token = getAccessToken();
    if (!token) {
      setError("Vui lòng đăng nhập lại.");
      return;
    }

    setIsSaving(true);
    try {
      const created = await createVariant(productId, parsed, token);
      onCreated(created);
      setDraft(blankDraft());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể thêm phiên bản.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-[1.2fr_0.8fr_1fr_0.8fr_150px] items-start gap-3">
      <div className="flex items-center gap-[0.4rem]">
        <input
          className="input flex-1"
          placeholder="Màu sắc"
          value={draft.color}
          onChange={(event) => updateDraft("color", event.target.value)}
          aria-label="Màu sắc biến thể mới"
        />
        <input
          type="color"
          className={COLOR_PICKER}
          value={draft.colorHex}
          onChange={(event) => updateDraft("colorHex", event.target.value)}
          aria-label="Mã màu biến thể mới"
        />
      </div>
      <input
        className="input"
        placeholder="Kích thước"
        value={draft.size}
        onChange={(event) => updateDraft("size", event.target.value)}
        aria-label="Kích thước biến thể mới"
      />
      <input
        className="input"
        type="number"
        min="0"
        step="1000"
        placeholder="Giá thêm"
        value={draft.extraPrice}
        onChange={(event) => updateDraft("extraPrice", event.target.value)}
        aria-label="Giá thêm biến thể mới"
      />
      <input
        className="input"
        type="number"
        min="0"
        step="1"
        placeholder="Tồn kho"
        value={draft.stock}
        onChange={(event) => updateDraft("stock", event.target.value)}
        aria-label="Tồn kho biến thể mới"
      />
      <button
        type="button"
        className="btn btn-primary btn-small"
        onClick={handleAdd}
        disabled={isSaving}
      >
        {isSaving ? "Đang thêm…" : "Thêm biến thể"}
      </button>
      {error && <p className="field-error my-[1em]">{error}</p>}
      <p className="col-span-full text-xs text-text-muted">
        Thêm biến thể trước để tải ảnh riêng cho biến thể này.
      </p>
    </div>
  );
}
