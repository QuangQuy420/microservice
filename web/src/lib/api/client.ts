// Base HTTP wrapper for all gateway calls. Every function in src/lib/api goes through
// this module — never fetch a downstream service (product-service, user-service, ...)
// directly, and never hardcode a URL other than NEXT_PUBLIC_API_BASE_URL. See
// .claude/refs/coder.md §4.
//
// Wire format (unified across all seven services): success is `{"data": ...}`, paginated success
// adds `{"meta": {page, pageSize, total}}`, failure is
// `{"error": {"code", "message", "details"?}}` with English `message`. `apiFetch` unwraps `data`
// so callers only ever see the payload; `apiFetchList` keeps `meta` alongside it. Error text is
// never shown raw — components translate `ApiError.code` (see translateApiError in ./errors).

import type { ApiResponse, PageMeta } from "@/types/api";

// Locally-raised failures that never reach the network. They carry a code like any backend error
// so the UI can translate them through the same `errors.<code>` path.
const NETWORK_ERROR = "NETWORK_ERROR";
const API_NOT_CONFIGURED = "API_NOT_CONFIGURED";

export class ApiError extends Error {
  readonly status: number;
  // Stable machine-readable code from `error.code`; null when the body wasn't the envelope at all
  // (a proxy/CDN error page, say) — callers then fall back to `message` (FR5).
  readonly code: string | null;
  // Only present on VALIDATION_ERROR (422): `{field: [messages...]}`, always arrays (NFR4).
  readonly details: Record<string, string[]> | null;

  constructor(
    message: string,
    status: number,
    code: string | null = null,
    details: Record<string, string[]> | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) {
    throw new ApiError("API base URL is not configured.", 500, API_NOT_CONFIGURED);
  }
  return baseUrl;
}

// Narrows `error.details` to the `{field: [msgs]}` contract — anything else is dropped rather
// than rendered, so a malformed body can't crash a form.
function readDetails(value: unknown): Record<string, string[]> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const details: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(messages)) {
      details[field] = messages.map((message) => String(message));
    }
  }

  return Object.keys(details).length > 0 ? details : null;
}

async function request(path: string, options: RequestInit): Promise<Response> {
  const url = `${getBaseUrl()}${path}`;

  // Multipart bodies (FormData, e.g. image uploads) must NOT get a JSON Content-Type — the
  // browser sets its own `multipart/form-data; boundary=...` header when it sees a FormData body.
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(`Cannot reach the API gateway (${path}).`, 0, NETWORK_ERROR);
  }

  if (!response.ok) {
    let message = response.statusText || `Request to ${path} failed`;
    let code: string | null = null;
    let details: Record<string, string[]> | null = null;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string; details?: unknown };
      };
      if (body?.error) {
        if (body.error.message) message = body.error.message;
        if (body.error.code) code = body.error.code;
        details = readDetails(body.error.details);
      }
    } catch {
      // response body wasn't JSON — fall back to statusText.
    }
    throw new ApiError(message, response.status, code, details);
  }

  return response;
}

// Success payload only: `{"data": X}` in, `X` out. 204 responses (deletes) resolve to undefined.
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await request(path, options);

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json()) as ApiResponse<T>;
  return body.data;
}

// Paginated/list endpoints: keeps `meta` next to the rows. Lists that carry no paging
// (brands, categories, face analyses) simply come back with `meta` undefined.
export async function apiFetchList<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T[]>> {
  const response = await request(path, options);
  const body = (await response.json()) as ApiResponse<T[]>;

  return { data: body.data, meta: body.meta };
}

export type { PageMeta };
