// The one place a language is registered (plan FR2/FR7, AC6): adding a locale = one entry here
// plus a matching `messages/<code>.json`. Nothing else in the app hardcodes a language code —
// the switcher, the cookie reader and the request config all read this list.

export const LOCALES = ["vi", "en"] as const;

export type Locale = (typeof LOCALES)[number];

// FR7: the language a first-time visitor (no NEXT_LOCALE cookie) gets.
export const DEFAULT_LOCALE: Locale = "vi";

// Read server-side in src/i18n/request.ts and written client-side in src/lib/i18n/locale.ts.
// Name kept as next-intl's conventional cookie name so future middleware-based routing would
// pick up the same value.
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | null | undefined): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
