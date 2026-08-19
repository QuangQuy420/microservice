"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ApiError, deleteProduct } from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { LoadingState } from "@/components/common/LoadingState";
import { useProducts } from "@/hooks/useProducts";
import { getAccessToken } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { formatFrameShapeVi } from "@/lib/labels";
import { formatPriceVnd } from "@/lib/format/price";

const ROW =
  "grid grid-cols-[56px_2.2fr_1fr_1fr_0.8fr_100px] items-center gap-3 px-[1.1rem] py-3 text-inherit no-underline";
const ROW_HEAD =
  "bg-[rgba(43,36,32,0.04)] text-xs font-semibold tracking-[0.05em] text-text-muted uppercase";
const ROW_BODY = "border-t border-[rgba(43,36,32,0.08)] text-sm";
const THUMB =
  "h-10 w-10 rounded-md bg-[image:repeating-linear-gradient(135deg,#ede6d8,#ede6d8_6px,#e4dbc9_6px,#e4dbc9_12px)] object-contain";
const ICON_BTN =
  "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-transparent no-underline";

// Admin product list (T17, AC1/AC4) — matches Admin Products.dc.html: stat cards (no AR stat,
// intentionally dropped, see plan Summary), search-by-name, and a table with edit/delete actions.
export default function AdminProductsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { products, isLoading, error, refetch } = useProducts({ includeAllStatuses: true });

  const term = searchInput.trim().toLowerCase();
  const filteredProducts = useMemo(
    () => (term ? products.filter((p) => p.name.toLowerCase().includes(term)) : products),
    [products, term],
  );

  const stats = useMemo(() => {
    const total = products.length;
    const onSale = products.filter((p) => p.status === "PUBLISHED").length;
    const outOfStock = total - onSale;
    return [
      { label: "Tổng sản phẩm", value: total },
      { label: "Đang bán", value: onSale },
      { label: "Hết hàng", value: outOfStock },
    ];
  }, [products]);

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Xoá sản phẩm "${name}"? Hành động này không thể hoàn tác.`)) return;

    const token = getAccessToken();
    if (!token) {
      setDeleteError("Vui lòng đăng nhập lại.");
      return;
    }

    setDeleteError(null);
    setDeletingId(id);
    try {
      await deleteProduct(id, token);
      await refetch();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Xoá sản phẩm thất bại.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-7 py-5">
        <div className="font-heading text-[1.35rem] font-semibold">Quản lý sản phẩm</div>
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-text text-[0.8rem] font-semibold text-bg">
          AD
        </div>
      </header>

      <section className="p-7">
        <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-surface px-[1.1rem] py-4">
              <div className="mb-1.5 text-[0.78rem] text-text-muted">{stat.label}</div>
              <div className="font-heading text-[1.35rem] font-semibold">{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative m-0 max-w-[380px] min-w-[220px] flex-1">
            <svg
              className="pointer-events-none absolute top-1/2 left-[14px] -translate-y-1/2 text-text-muted"
              width="15"
              height="15"
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
              aria-label="Tìm sản phẩm"
              placeholder="Tìm sản phẩm…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <Link href="/admin/products/new" className="btn btn-primary">
            + Thêm sản phẩm
          </Link>
        </div>

        {deleteError && <ErrorState message={deleteError} />}

        {isLoading && <LoadingState label="Đang tải sản phẩm..." />}
        {!isLoading && error && <ErrorState message={error} />}
        {!isLoading && !error && (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className={cn(ROW, ROW_HEAD)}>
              <span></span>
              <span>Sản phẩm</span>
              <span>Kiểu dáng</span>
              <span>Giá</span>
              <span>Trạng thái</span>
              <span></span>
            </div>
            {filteredProducts.map((product) => {
              const thumbnail = product.images.find((image) => image.isThumbnail) ?? product.images[0];
              const isOnSale = product.status === "PUBLISHED";
              return (
                <div key={product.id} className={cn(ROW, ROW_BODY)}>
                  {thumbnail ? (
                    <ImageWithFallback
                      src={thumbnail.imageUrl}
                      alt={product.name}
                      className={THUMB}
                      placeholderClassName={THUMB}
                    />
                  ) : (
                    <div className={THUMB} role="img" aria-label={product.name} />
                  )}
                  <div>
                    <div className="font-semibold">{product.name}</div>
                    <div className="text-xs text-text-muted">{product.brand.name}</div>
                  </div>
                  <span className="text-text-secondary">{formatFrameShapeVi(product.frameShape)}</span>
                  <span className="font-medium">{formatPriceVnd(product.basePrice)}</span>
                  <span
                    className={cn(
                      "w-fit rounded-full px-[0.6rem] py-1 text-xs font-semibold",
                      isOnSale
                        ? "bg-[rgba(74,90,82,0.14)] text-[#4a5a52]"
                        : "bg-[rgba(138,122,99,0.14)] text-text-muted",
                    )}
                  >
                    {isOnSale ? "Đang bán" : "Hết hàng"}
                  </span>
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className={cn(ICON_BTN, "text-text")}
                      aria-label={`Sửa ${product.name}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                      </svg>
                    </Link>
                    <button
                      type="button"
                      className={cn(ICON_BTN, "text-[#b4483a]")}
                      aria-label={`Xoá ${product.name}`}
                      disabled={deletingId === product.id}
                      onClick={() => handleDelete(product.id, product.name)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredProducts.length === 0 && (
              <div className="px-[1.1rem] py-10 text-center text-sm text-text-muted">
                Không tìm thấy sản phẩm nào khớp với &quot;{searchInput}&quot;.
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
