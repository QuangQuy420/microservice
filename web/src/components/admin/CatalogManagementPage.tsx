"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import type { Brand, CreateBrandPayload } from "@/types/product";
import type { Category, CreateCategoryPayload } from "@/types/category";

const ROW = "grid items-center gap-3 px-[1.1rem] py-3 text-inherit no-underline";
const ROW_HEAD =
  "bg-[rgba(43,36,32,0.04)] text-xs font-semibold tracking-[0.05em] text-text-muted uppercase";
const ROW_BODY = "border-t border-[rgba(43,36,32,0.08)] text-sm";
const ICON_BTN =
  "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-transparent no-underline";
const FORM_FIELD = "mb-1.5 block text-[0.8rem] font-medium";

interface ResourceConfig<T extends Brand | Category> {
  title: string;
  searchLabel: string;
  createLabel: string;
  resourceLabel: string;
  getItems: () => Promise<T[]>;
  create: (payload: CreateBrandPayload | CreateCategoryPayload, token: string) => Promise<T>;
  update: (
    id: string,
    payload: CreateBrandPayload | CreateCategoryPayload,
    token: string,
  ) => Promise<T>;
  remove: (id: string, token: string) => Promise<void>;
}

export function CatalogManagementPage<T extends Brand | Category>({
  config,
}: {
  config: ResourceConfig<T>;
}) {
  const configRef = useRef(config);
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<T | null | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadItems() {
    setIsLoading(true);
    setLoadError(null);
    try {
      setItems(await config.getItems());
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : `Không thể tải ${config.resourceLabel}.`);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadItemsEffect() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const result = await configRef.current.getItems();
        if (!cancelled) setItems(result);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof ApiError
              ? error.message
              : `Không thể tải ${configRef.current.resourceLabel}.`,
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadItemsEffect();

    return () => {
      cancelled = true;
    };
  }, []);

  const term = search.trim().toLocaleLowerCase("vi");
  const filteredItems = useMemo(
    () => items.filter((item) => !term || item.name.toLocaleLowerCase("vi").includes(term)),
    [items, term],
  );

  async function handleDelete(item: T) {
    if (!window.confirm(`Xoá ${config.resourceLabel} "${item.name}"? Hành động này không thể hoàn tác.`)) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setActionError("Bạn cần đăng nhập lại để thực hiện thao tác này.");
      return;
    }

    setActionError(null);
    setDeletingId(item.id);
    try {
      await config.remove(item.id, token);
      await loadItems();
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.message
          : `Không thể xoá ${config.resourceLabel}. Vui lòng thử lại.`,
      );
    } finally {
      setDeletingId(null);
    }
  }

  const isBrand = config.resourceLabel === "thương hiệu";
  const rowColumns = isBrand
    ? "grid-cols-[1.1fr_1.3fr_1.5fr_100px]"
    : "grid-cols-[1.5fr_1fr_100px]";

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-7 py-5">
        <div className="font-heading text-[1.35rem] font-semibold">{config.title}</div>
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-text text-[0.8rem] font-semibold text-bg">
          AD
        </div>
      </header>

      <section className="p-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative m-0 max-w-[380px] min-w-[220px] flex-1">
            <input
              type="search"
              className="w-full rounded-full border border-border bg-surface py-3 pr-4 pl-10 font-body text-[0.9rem] text-text"
              aria-label={config.searchLabel}
              placeholder={config.searchLabel}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setEditing(null)}>
            + {config.createLabel}
          </button>
        </div>

        {actionError && <ErrorState message={actionError} />}
        {isLoading && <LoadingState label={`Đang tải ${config.resourceLabel}...`} />}
        {!isLoading && loadError && <ErrorState message={loadError} />}
        {!isLoading && !loadError && (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className={cn(ROW, rowColumns, ROW_HEAD)}>
              <span>Tên</span>
              {isBrand ? <><span>Logo</span><span>Mô tả</span></> : <span>Slug</span>}
              <span></span>
            </div>
            {filteredItems.map((item) => (
              <div key={item.id} className={cn(ROW, rowColumns, ROW_BODY)}>
                <span className="font-semibold">{item.name}</span>
                {isBrand ? <><span>{(item as Brand).logoUrl || "—"}</span><span>{(item as Brand).description || "—"}</span></> : <span>{(item as Category).slug}</span>}
                <div className="flex justify-end gap-2">
                  <button type="button" className={cn(ICON_BTN, "text-text")} aria-label={`Sửa ${item.name}`} onClick={() => setEditing(item)}>Sửa</button>
                  <button type="button" className={cn(ICON_BTN, "text-[#b4483a]")} aria-label={`Xoá ${item.name}`} disabled={deletingId === item.id} onClick={() => handleDelete(item)}>
                    {deletingId === item.id ? "..." : "Xoá"}
                  </button>
                </div>
              </div>
            ))}
            {filteredItems.length === 0 && <div className="px-[1.1rem] py-10 text-center text-sm text-text-muted">Không tìm thấy {config.resourceLabel} nào phù hợp.</div>}
          </div>
        )}
      </section>

      {editing !== undefined && (
        <CatalogFormModal
          item={editing}
          config={config}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await loadItems();
          }}
        />
      )}
    </>
  );
}

function CatalogFormModal<T extends Brand | Category>({
  item,
  config,
  onClose,
  onSaved,
}: {
  item: T | null;
  config: ResourceConfig<T>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isBrand = config.resourceLabel === "thương hiệu";
  const [name, setName] = useState(item?.name ?? "");
  const [logoUrl, setLogoUrl] = useState(isBrand && item ? (item as Brand).logoUrl ?? "" : "");
  const [description, setDescription] = useState(isBrand && item ? (item as Brand).description ?? "" : "");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setSubmitError(`Vui lòng nhập tên ${config.resourceLabel}.`);
      return;
    }
    if (isBrand && logoUrl.trim()) {
      try {
        new URL(logoUrl.trim());
      } catch {
        setSubmitError("URL logo không hợp lệ.");
        return;
      }
    }

    const token = getAccessToken();
    if (!token) {
      setSubmitError("Bạn cần đăng nhập lại để thực hiện thao tác này.");
      return;
    }

    const payload: CreateBrandPayload | CreateCategoryPayload = isBrand
      ? { name: trimmedName, logoUrl: logoUrl.trim() || null, description: description.trim() || null }
      : { name: trimmedName };

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      if (item) {
        await config.update(item.id, payload, token);
      } else {
        await config.create(payload, token);
      }
      await onSaved();
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : `Không thể lưu ${config.resourceLabel}. Vui lòng thử lại.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] grid animate-account-menu-in place-items-center bg-[rgba(43,36,32,0.45)] p-6" role="presentation" onClick={onClose}>
      <div className="max-h-[calc(100vh-3rem)] w-[min(100%,480px)] overflow-y-auto rounded-[18px] border border-border bg-surface p-[clamp(1.25rem,3vw,1.75rem)] shadow-[0_20px_50px_rgba(43,36,32,0.16)]" role="dialog" aria-modal="true" aria-labelledby="catalog-form-heading" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 id="catalog-form-heading" className="font-heading text-[1.3rem] text-text">{item ? `Sửa ${config.resourceLabel}` : config.createLabel}</h2>
          <button type="button" className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-[1.4rem] leading-none text-text-muted hover:bg-[rgba(43,36,32,0.06)] hover:text-text" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <div className={FORM_FIELD}>
          <label htmlFor="catalog-name">Tên {config.resourceLabel}</label>
          <input id="catalog-name" type="text" className="input mb-4" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        {isBrand && <>
          <div className={FORM_FIELD}>
            <label htmlFor="catalog-logo">URL logo</label>
            <input id="catalog-logo" type="url" className="input mb-4" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://..." />
          </div>
          <div className={FORM_FIELD}>
            <label htmlFor="catalog-description">Mô tả</label>
            <textarea id="catalog-description" className="input mb-4 resize-y" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </div>
        </>}
        {!isBrand && <p className="text-[0.78rem] text-text-muted">Slug sẽ được hệ thống tự tạo sau khi lưu.</p>}
        {submitError && <p role="alert" className="my-[1em] text-[#a92828]">{submitError}</p>}
        <div className="mt-6 flex gap-3">
          <button type="button" className="btn btn-outline flex-1" onClick={onClose} disabled={isSubmitting}>Hủy</button>
          <button type="button" className="btn btn-primary flex-1" onClick={handleSubmit} disabled={isSubmitting}>{isSubmitting ? "Đang lưu..." : "Lưu"}</button>
        </div>
      </div>
    </div>
  );
}
