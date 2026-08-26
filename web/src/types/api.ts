// The unified response envelope every service now emits: `{"data": ...}` for a single object,
// `{"data": [...], "meta": {...}}` for a paginated list. Unpaginated lists (brands, categories,
// face analyses) send `data` with no `meta`.

// 1-based `page`; `total` is the row count across all pages.
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: PageMeta;
}

// A list response with its paging info — what apiFetchList returns.
export type PaginatedResponse<T> = ApiResponse<T[]>;
