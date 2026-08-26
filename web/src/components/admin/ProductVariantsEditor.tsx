"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  apiErrorDetails,
  createVariant,
  deleteVariant,
  updateVariant,
  useApiError,
} from "@/lib/api";
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

type AdminTranslator = ReturnType<typeof useTranslations<"admin">>;

/** Returns the parsed payload, or null (after setting `setError`) if the draft is invalid. */
function parseDraft(
  draft: VariantDraft,
  setError: (message: string) => void,
  t: AdminTranslator,
): { color: string; colorHex: string; size: string; extraPrice: number; stock: number } | null {
  const color = draft.color.trim();
  const size = draft.size.trim();
  if (!color || !size) {
    setError(t("variants.colorSizeRequired"));
    return null;
  }
  const colorHex = draft.colorHex.trim();
  if (!HEX_COLOR_PATTERN.test(colorHex)) {
    setError(t("variants.colorHexInvalid"));
    return null;
  }
  const extraPrice = Number(draft.extraPrice);
  if (!Number.isFinite(extraPrice) || extraPrice < 0) {
    setError(t("variants.extraPriceInvalid"));
    return null;
  }
  const stock = Number(draft.stock);
  if (!Number.isInteger(stock) || stock < 0) {
    setError(t("variants.stockInvalid"));
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
  const t = useTranslations("admin");

  if (!productId) {
    return <p className="text-xs text-text-muted">{t("variants.saveFirst")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className={cn(ROW, ROW_HEAD)}>
          <span>{t("variants.columnColor")}</span>
          <span>{t("variants.columnSize")}</span>
          <span>{t("variants.columnExtraPrice")}</span>
          <span>{t("variants.columnStock")}</span>
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
            {t("variants.empty")}
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
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const translateError = useApiError();
  const [draft, setDraft] = useState<VariantDraft>(draftFromVariant(variant));
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function updateDraft<K extends keyof VariantDraft>(key: K, value: VariantDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    setError(null);
    setFieldErrors({});
    const parsed = parseDraft(draft, setError, t);
    if (!parsed) return;

    const token = getAccessToken();
    if (!token) {
      setError(t("variants.sessionExpired"));
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateVariant(productId, variant.id, parsed, token);
      onUpdated(updated);
    } catch (err) {
      setError(translateError(err));
      setFieldErrors(apiErrorDetails(err));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setFieldErrors({});
    const token = getAccessToken();
    if (!token) {
      setError(t("variants.sessionExpired"));
      return;
    }

    setIsDeleting(true);
    try {
      await deleteVariant(productId, variant.id, token);
      onDeleted(variant.id);
    } catch (err) {
      setError(translateError(err));
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
            aria-label={t("variants.colorAria")}
          />
          <input
            type="color"
            className={COLOR_PICKER}
            value={draft.colorHex}
            onChange={(event) => updateDraft("colorHex", event.target.value)}
            aria-label={t("variants.colorHexAria")}
          />
        </div>
        <input
          className="input"
          value={draft.size}
          onChange={(event) => updateDraft("size", event.target.value)}
          aria-label={t("variants.sizeAria")}
        />
        <input
          className="input"
          type="number"
          min="0"
          step="1000"
          value={draft.extraPrice}
          onChange={(event) => updateDraft("extraPrice", event.target.value)}
          aria-label={t("variants.extraPriceAria")}
        />
        <input
          className="input"
          type="number"
          min="0"
          step="1"
          value={draft.stock}
          onChange={(event) => updateDraft("stock", event.target.value)}
          aria-label={t("variants.stockAria")}
        />
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={handleSave}
            disabled={isSaving || isDeleting}
          >
            {isSaving ? tCommon("saving") : t("variants.save")}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={handleDelete}
            disabled={isSaving || isDeleting}
          >
            {isDeleting ? t("variants.deleting") : tCommon("delete")}
          </button>
        </div>
        {error && <p className="field-error my-[1em]">{error}</p>}
        {Object.values(fieldErrors)
          .flat()
          .map((message) => (
            <p key={message} role="alert" className="field-error my-[1em]">
              {message}
            </p>
          ))}
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
  const t = useTranslations("admin");
  const translateError = useApiError();
  const [draft, setDraft] = useState<VariantDraft>(blankDraft());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function updateDraft<K extends keyof VariantDraft>(key: K, value: VariantDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleAdd() {
    setError(null);
    setFieldErrors({});
    const parsed = parseDraft(draft, setError, t);
    if (!parsed) return;

    const token = getAccessToken();
    if (!token) {
      setError(t("variants.sessionExpired"));
      return;
    }

    setIsSaving(true);
    try {
      const created = await createVariant(productId, parsed, token);
      onCreated(created);
      setDraft(blankDraft());
    } catch (err) {
      setError(translateError(err));
      setFieldErrors(apiErrorDetails(err));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-[1.2fr_0.8fr_1fr_0.8fr_150px] items-start gap-3">
      <div className="flex items-center gap-[0.4rem]">
        <input
          className="input flex-1"
          placeholder={t("variants.columnColor")}
          value={draft.color}
          onChange={(event) => updateDraft("color", event.target.value)}
          aria-label={t("variants.newColorAria")}
        />
        <input
          type="color"
          className={COLOR_PICKER}
          value={draft.colorHex}
          onChange={(event) => updateDraft("colorHex", event.target.value)}
          aria-label={t("variants.newColorHexAria")}
        />
      </div>
      <input
        className="input"
        placeholder={t("variants.columnSize")}
        value={draft.size}
        onChange={(event) => updateDraft("size", event.target.value)}
        aria-label={t("variants.newSizeAria")}
      />
      <input
        className="input"
        type="number"
        min="0"
        step="1000"
        placeholder={t("variants.columnExtraPrice")}
        value={draft.extraPrice}
        onChange={(event) => updateDraft("extraPrice", event.target.value)}
        aria-label={t("variants.newExtraPriceAria")}
      />
      <input
        className="input"
        type="number"
        min="0"
        step="1"
        placeholder={t("variants.columnStock")}
        value={draft.stock}
        onChange={(event) => updateDraft("stock", event.target.value)}
        aria-label={t("variants.newStockAria")}
      />
      <button
        type="button"
        className="btn btn-primary btn-small"
        onClick={handleAdd}
        disabled={isSaving}
      >
        {isSaving ? t("variants.adding") : t("variants.add")}
      </button>
      {error && <p className="field-error my-[1em]">{error}</p>}
      {Object.values(fieldErrors)
        .flat()
        .map((message) => (
          <p key={message} role="alert" className="field-error my-[1em]">
            {message}
          </p>
        ))}
      <p className="col-span-full text-xs text-text-muted">
        {t("variants.addImageHint")}
      </p>
    </div>
  );
}
