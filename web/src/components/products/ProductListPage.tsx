"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useAvailableFrameShapes } from "@/hooks/useAvailableFrameShapes";
import { useBrands } from "@/hooks/useBrands";
import { useCategories } from "@/hooks/useCategories";
import { useProducts } from "@/hooks/useProducts";
import type { FrameShape } from "@/types/product";
import { HeroCarousel } from "./HeroCarousel";
import { ProductFilters } from "./ProductFilters";
import { ProductGrid } from "./ProductGrid";

// FR2/T7: how long to wait after the last keystroke before pushing the search term to the URL.
const SEARCH_DEBOUNCE_MS = 300;

interface FilterUpdate {
  categoryId?: string;
  brandId?: string;
  frameShape?: FrameShape;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
}

// Reads/writes filters via the URL search params so filtered views are shareable/bookmarkable
// and the browser back button works as expected.
export function ProductListPage() {
  const t = useTranslations("products");
  const router = useRouter();
  const searchParams = useSearchParams();

  const categoryId = searchParams.get("categoryId") ?? undefined;
  const brandId = searchParams.get("brandId") ?? undefined;
  const frameShape = (searchParams.get("frameShape") as FrameShape | null) ?? undefined;
  const minPrice = searchParams.has("minPrice") ? Number(searchParams.get("minPrice")) : undefined;
  const maxPrice = searchParams.has("maxPrice") ? Number(searchParams.get("maxPrice")) : undefined;
  const search = searchParams.get("search") ?? undefined;

  const { products, isLoading, error } = useProducts({
    categoryId,
    brandId,
    frameShape,
    minPrice,
    maxPrice,
    search,
  });
  const { categories } = useCategories();
  const { brands } = useBrands();
  const { frameShapes } = useAvailableFrameShapes();

  const [searchInput, setSearchInput] = useState(search ?? "");
  // Tracks the last `search` URL param value we've synced `searchInput` from, so we can react to
  // it changing from outside a keystroke here (e.g. browser back/forward — NFR4) without an
  // effect. This is React's documented "adjust state during render" pattern, not a plain
  // setState-in-effect (which cascades an extra render for no benefit).
  const [syncedSearch, setSyncedSearch] = useState(search);
  if (search !== syncedSearch) {
    setSyncedSearch(search);
    setSearchInput(search ?? "");
  }

  function updateFilters(next: FilterUpdate) {
    const params = new URLSearchParams(searchParams.toString());
    const nextCategoryId = "categoryId" in next ? next.categoryId : categoryId;
    const nextBrandId = "brandId" in next ? next.brandId : brandId;
    const nextFrameShape = "frameShape" in next ? next.frameShape : frameShape;
    const nextMinPrice = "minPrice" in next ? next.minPrice : minPrice;
    const nextMaxPrice = "maxPrice" in next ? next.maxPrice : maxPrice;
    const nextSearch = "search" in next ? next.search : search;

    if (nextCategoryId) params.set("categoryId", nextCategoryId);
    else params.delete("categoryId");

    if (nextBrandId) params.set("brandId", nextBrandId);
    else params.delete("brandId");

    if (nextFrameShape) params.set("frameShape", nextFrameShape);
    else params.delete("frameShape");

    if (nextMinPrice !== undefined) params.set("minPrice", String(nextMinPrice));
    else params.delete("minPrice");

    if (nextMaxPrice !== undefined) params.set("maxPrice", String(nextMaxPrice));
    else params.delete("maxPrice");

    if (nextSearch) params.set("search", nextSearch);
    else params.delete("search");

    const query = params.toString();
    router.push(query ? `/?${query}` : "/");
  }

  // updateFilters closes over this render's categoryId/brandId/frameShape/minPrice/maxPrice/searchParams.
  // The debounce timer below can fire well after a later render (e.g. a pill click) has moved
  // those values on — reading it through a ref kept fresh every render (instead of calling the
  // directly-closed-over updateFilters) means the timer always applies the search term on top of
  // whatever filters are current when it actually fires, not whatever they were when it was set.
  const updateFiltersRef = useRef(updateFilters);
  useEffect(() => {
    updateFiltersRef.current = updateFilters;
  });

  // Debounce: only push the search term to the URL (and trigger a refetch) after the user
  // stops typing for SEARCH_DEBOUNCE_MS, so we don't fire a request per keystroke.
  useEffect(() => {
    if (searchInput === (search ?? "")) return;
    const timer = setTimeout(() => {
      updateFiltersRef.current({ search: searchInput || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce keys off searchInput only.
  }, [searchInput]);

  return (
    <>
      <section className="flex flex-wrap items-center gap-10 pt-6 pb-10">
        <div className="min-w-[280px] flex-[1_1_380px]">
          <p className="mb-[0.9rem] text-[0.8rem] font-semibold tracking-[0.12em] text-text-muted uppercase">
            {t("heroEyebrow")}
          </p>
          <h1
            id="catalog-heading"
            className="mb-[1.1rem] font-heading text-[clamp(1.9rem,4vw,3rem)] leading-[1.15] font-semibold"
          >
            {t("heroTitleLine1")}
            <br />
            {t("heroTitleLine2")}
          </h1>
          <p className="mb-7 max-w-[460px] text-base leading-[1.6] text-text-secondary">
            {t("heroDescription")}
          </p>
          <Link href="/face-analysis" className="btn btn-primary">
            {t("heroCta")}
          </Link>
        </div>
        <div className="aspect-[4/3] min-w-[220px] flex-[1_1_320px] overflow-hidden rounded-[6px] bg-[#ede6d8]">
          <HeroCarousel />
        </div>
      </section>

      <section aria-labelledby="catalog-heading">
        <div className="relative mt-2 mb-5 max-w-[420px]">
          <svg
            className="pointer-events-none absolute top-1/2 left-[14px] -translate-y-1/2 text-text-muted"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="search"
            className="w-full rounded-full border border-border bg-surface py-3 pr-4 pl-10 font-body text-[0.9rem] text-text"
            aria-label={t("searchLabel")}
            placeholder={t("searchPlaceholder")}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>

        <ProductFilters
          brands={brands}
          categories={categories}
          frameShapes={frameShapes}
          brandId={brandId}
          categoryId={categoryId}
          frameShape={frameShape}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onApplyFilters={(filters) =>
            updateFilters({
              brandId: filters.brandId,
              categoryId: filters.categoryId,
              frameShape: filters.frameShape,
              minPrice: filters.minPrice,
              maxPrice: filters.maxPrice,
            })
          }
        />
        {isLoading && <LoadingState label={t("loading")} />}
        {!isLoading && error && <ErrorState message={error} />}
        {!isLoading && !error && <ProductGrid products={products} />}
      </section>
    </>
  );
}
