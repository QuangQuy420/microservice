"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  apiErrorDetails,
  createProduct,
  getBrands,
  getCategories,
  updateProduct,
  useApiError,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { FRAME_SHAPES, GENDER_TARGETS, useLabels } from "@/lib/labels";
import type { Brand } from "@/types/product";
import type { Category } from "@/types/category";
import type {
  FaceShapeTag,
  FrameShape,
  GenderTarget,
  Product,
  ProductStatus,
} from "@/types/product";
import { FaceShapeTagPicker } from "./FaceShapeTagPicker";
import { ProductImageManager } from "./ProductImageManager";
import { ProductVariantsEditor } from "./ProductVariantsEditor";
import type { ProductVariant } from "@/types/product";

interface ProductEditFormProps {
  product: Product | null;
}

const CARD = "rounded-lg border border-border bg-surface p-5";
const CARD_TITLE =
  "mb-4 text-[0.78rem] font-semibold tracking-[0.06em] text-text-muted uppercase";
const FORM_FIELD = "mb-1.5 block text-[0.8rem] font-medium";
const FIELD_ERROR = "field-error mb-4";

interface FormState {
  name: string;
  categoryId: string;
  brandId: string;
  frameShape: FrameShape;
  genderTarget: GenderTarget;
  material: string;
  basePrice: string;
  description: string;
  faceFitNote: string;
  faceShapes: FaceShapeTag[];
  status: ProductStatus;
}

function blankForm(): FormState {
  return {
    name: "",
    categoryId: "",
    brandId: "",
    frameShape: "ROUND",
    genderTarget: "UNISEX",
    material: "",
    basePrice: "",
    description: "",
    faceFitNote: "",
    faceShapes: [],
    // Defaults to "on sale" (PUBLISHED) for new products — never left unset.
    status: "PUBLISHED",
  };
}

function formFromProduct(product: Product): FormState {
  return {
    name: product.name,
    categoryId: product.category.id,
    brandId: product.brand.id,
    frameShape: product.frameShape,
    genderTarget: product.genderTarget,
    material: product.material ?? "",
    basePrice: String(product.basePrice),
    description: product.description ?? "",
    faceFitNote: product.faceFitNote ?? "",
    faceShapes: product.faceShapes,
    status: product.status === "ARCHIVED" ? "ARCHIVED" : "PUBLISHED",
  };
}

// Shared create/edit form (T18), matching Product Edit.dc.html's field set and order; the labels
// come from the `admin` message namespace. `product === null` means "create" (isNew); otherwise
// the form is prefilled for edit.
export function ProductEditForm({ product }: ProductEditFormProps) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const labels = useLabels();
  const translateError = useApiError();
  const router = useRouter();
  const isNew = product === null;

  const [form, setForm] = useState<FormState>(product ? formFromProduct(product) : blankForm());
  // Once a new product is created, further image uploads attach to this id (uploads need an
  // existing product — see ImageUploadSlot). Starts as the existing product's id in edit mode.
  const [savedProductId, setSavedProductId] = useState<string | null>(product?.id ?? null);
  // Same "needs an existing product" constraint as image uploads — see ProductVariantsEditor.
  const [variants, setVariants] = useState<ProductVariant[]>(product?.variants ?? []);

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      try {
        const [categoryList, brandList] = await Promise.all([getCategories(), getBrands()]);
        if (cancelled) return;
        setCategories(categoryList);
        setBrands(brandList);
        // Default the selects to the first available option once loaded, for the create form.
        setForm((current) => ({
          ...current,
          categoryId: current.categoryId || categoryList[0]?.id || "",
          brandId: current.brandId || brandList[0]?.id || "",
        }));
      } catch (err) {
        if (!cancelled) {
          setError(translateError(err));
        }
      }
    }
    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, [translateError]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleStatus() {
    setForm((current) => ({
      ...current,
      status: current.status === "PUBLISHED" ? "ARCHIVED" : "PUBLISHED",
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const basePrice = Number(form.basePrice);
    if (!form.name.trim()) {
      setError(t("products.nameRequired"));
      return;
    }
    if (!form.categoryId || !form.brandId) {
      setError(t("products.categoryBrandRequired"));
      return;
    }
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      setError(t("products.priceInvalid"));
      return;
    }

    const payload = {
      name: form.name.trim(),
      categoryId: form.categoryId,
      brandId: form.brandId,
      frameShape: form.frameShape,
      genderTarget: form.genderTarget,
      material: form.material.trim() || null,
      basePrice,
      description: form.description.trim() || null,
      faceFitNote: form.faceFitNote.trim() || null,
      faceShapes: form.faceShapes,
      status: form.status,
    };

    const token = getAccessToken();
    if (!token) {
      setError(t("products.sessionExpired"));
      return;
    }

    setIsSubmitting(true);
    try {
      if (savedProductId) {
        await updateProduct(savedProductId, payload, token);
      } else {
        const created = await createProduct(payload, token);
        setSavedProductId(created.id);
      }
      router.push("/admin/products");
    } catch (err) {
      setError(translateError(err));
      setFieldErrors(apiErrorDetails(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  const isPublished = form.status === "PUBLISHED";

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-7 py-5">
        <a
          href="/admin/products"
          className="flex items-center gap-2 text-sm font-medium text-text no-underline"
        >
          ← {t("products.backToList")}
        </a>
        <div className="flex gap-2.5">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => router.push("/admin/products")}
          >
            {tCommon("cancel")}
          </button>
          <button type="submit" form="product-edit-form" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? tCommon("saving") : t("products.saveProduct")}
          </button>
        </div>
      </header>

      <form id="product-edit-form" className="mx-auto max-w-[980px] p-7" onSubmit={handleSubmit}>
        <div className="mb-1 font-heading text-2xl font-semibold">
          {isNew ? t("products.newTitle") : t("products.editTitle")}
        </div>
        <div className="mb-6 text-[0.85rem] text-text-muted">
          {isNew
            ? t("products.newSubtitle")
            : t("products.editSubtitle", { name: product.name })}
        </div>

        {error && <p className="field-error my-[1em]">{error}</p>}

        <div className="flex flex-col gap-6">
          <div className="w-full">
            <div className="rounded-lg border border-border bg-surface p-[1.125rem]">
              <div className={CARD_TITLE}>{t("products.imagesSection")}</div>
              {!savedProductId && (
                <p className="text-xs text-text-muted">{t("products.saveFirstForImages")}</p>
              )}
              <ProductImageManager
                productId={savedProductId}
                variantId={null}
                maxCount={8}
                images={product?.images.filter((image) => image.variantId === null) ?? []}
                onChange={() => {}}
              />
            </div>
          </div>

          <div className="flex w-full flex-col gap-[1.125rem]">
            <div className={CARD}>
              <div className={CARD_TITLE}>{t("products.basicSection")}</div>

              <label className={FORM_FIELD} htmlFor="product-name">
                {t("products.nameLabel")}
              </label>
              <input
                id="product-name"
                className="input mb-4"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
              />
              {fieldErrors.name?.map((message) => (
                <p key={message} role="alert" className={FIELD_ERROR}>
                  {message}
                </p>
              ))}

              <div className="flex gap-3.5">
                <div className="flex-1">
                  <label className={FORM_FIELD} htmlFor="product-category">
                    {t("products.categoryLabel")}
                  </label>
                  <select
                    id="product-category"
                    className="input mb-4"
                    value={form.categoryId}
                    onChange={(event) => updateField("categoryId", event.target.value)}
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.categoryId?.map((message) => (
                    <p key={message} role="alert" className={FIELD_ERROR}>
                      {message}
                    </p>
                  ))}
                </div>
                <div className="flex-1">
                  <label className={FORM_FIELD} htmlFor="product-brand">
                    {t("products.brandLabel")}
                  </label>
                  <select
                    id="product-brand"
                    className="input mb-4"
                    value={form.brandId}
                    onChange={(event) => updateField("brandId", event.target.value)}
                  >
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.brandId?.map((message) => (
                    <p key={message} role="alert" className={FIELD_ERROR}>
                      {message}
                    </p>
                  ))}
                </div>
              </div>

              <div className="flex gap-3.5">
                <div className="flex-1">
                  <label className={FORM_FIELD} htmlFor="product-shape">
                    {t("products.frameShapeLabel")}
                  </label>
                  <select
                    id="product-shape"
                    className="input mb-4"
                    value={form.frameShape}
                    onChange={(event) =>
                      updateField("frameShape", event.target.value as FrameShape)
                    }
                  >
                    {FRAME_SHAPES.map((shape) => (
                      <option key={shape} value={shape}>
                        {labels.frameShape(shape)}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.frameShape?.map((message) => (
                    <p key={message} role="alert" className={FIELD_ERROR}>
                      {message}
                    </p>
                  ))}
                </div>
                <div className="flex-1">
                  <label className={FORM_FIELD} htmlFor="product-price">
                    {t("products.priceLabel")}
                  </label>
                  <input
                    id="product-price"
                    type="number"
                    min="0"
                    step="1000"
                    className="input mb-4"
                    value={form.basePrice}
                    onChange={(event) => updateField("basePrice", event.target.value)}
                  />
                  {fieldErrors.basePrice?.map((message) => (
                    <p key={message} role="alert" className={FIELD_ERROR}>
                      {message}
                    </p>
                  ))}
                </div>
              </div>

              <div className="flex gap-3.5">
                <div className="flex-1">
                  <label className={FORM_FIELD} htmlFor="product-gender">
                    {t("products.genderLabel")}
                  </label>
                  <select
                    id="product-gender"
                    className="input mb-4"
                    value={form.genderTarget}
                    onChange={(event) =>
                      updateField("genderTarget", event.target.value as GenderTarget)
                    }
                  >
                    {GENDER_TARGETS.map((gender) => (
                      <option key={gender} value={gender}>
                        {labels.genderTarget(gender)}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.genderTarget?.map((message) => (
                    <p key={message} role="alert" className={FIELD_ERROR}>
                      {message}
                    </p>
                  ))}
                </div>
                <div className="flex-1">
                  <label className={FORM_FIELD} htmlFor="product-material">
                    {t("products.materialLabel")}
                  </label>
                  <input
                    id="product-material"
                    className="input mb-4"
                    value={form.material}
                    onChange={(event) => updateField("material", event.target.value)}
                  />
                  {fieldErrors.material?.map((message) => (
                    <p key={message} role="alert" className={FIELD_ERROR}>
                      {message}
                    </p>
                  ))}
                </div>
              </div>

              <label className={FORM_FIELD} htmlFor="product-description">
                {t("products.descriptionLabel")}
              </label>
              <textarea
                id="product-description"
                className="input mb-4 resize-y"
                rows={4}
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
              />
              {fieldErrors.description?.map((message) => (
                <p key={message} role="alert" className={FIELD_ERROR}>
                  {message}
                </p>
              ))}

              <label className={FORM_FIELD} htmlFor="product-fit-note">
                {t("products.faceFitNoteLabel")}
              </label>
              <input
                id="product-fit-note"
                className="input mb-4"
                value={form.faceFitNote}
                onChange={(event) => updateField("faceFitNote", event.target.value)}
              />
              {fieldErrors.faceFitNote?.map((message) => (
                <p key={message} role="alert" className={FIELD_ERROR}>
                  {message}
                </p>
              ))}
            </div>

            <div className={CARD}>
              <div className={CARD_TITLE}>{t("products.faceShapesSection")}</div>
              <FaceShapeTagPicker
                selected={form.faceShapes}
                onChange={(next) => updateField("faceShapes", next)}
              />
              {fieldErrors.faceShapes?.map((message) => (
                <p key={message} role="alert" className={FIELD_ERROR}>
                  {message}
                </p>
              ))}
            </div>

            <div className={CARD}>
              <div className={CARD_TITLE}>{t("products.variantsSection")}</div>
              <ProductVariantsEditor
                productId={savedProductId}
                variants={variants}
                images={product?.images ?? []}
                onChange={setVariants}
              />
            </div>

            <div className={cn(CARD, "flex items-center justify-between gap-4")}>
              <div>
                <div className="mb-0.5 text-sm font-semibold">{t("products.statusSection")}</div>
                <div className="text-[0.78rem] text-text-muted">
                  {t("products.statusHint")}
                </div>
              </div>
              <button
                type="button"
                className={cn(
                  "relative h-7 w-12 shrink-0 cursor-pointer rounded-full border-0",
                  isPublished ? "bg-[#4a5a52]" : "bg-[rgba(43,36,32,0.2)]",
                )}
                onClick={toggleStatus}
                aria-pressed={isPublished}
                aria-label={t("products.statusSection")}
              >
                <span
                  className={cn(
                    "absolute top-[3px] h-[22px] w-[22px] rounded-full bg-surface transition-[left] duration-150",
                    isPublished ? "left-[23px]" : "left-[3px]",
                  )}
                />
              </button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
