import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";

// next-intl's per-request config (auto-detected by the plugin in next.config.ts). Locale comes
// from the NEXT_LOCALE cookie only — there are no locale URL prefixes and no middleware, so a
// language switch never changes the route (NFR3). No cookie => DEFAULT_LOCALE (AC11).
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  return {
    locale,
    // Template import so a new locale is picked up by adding messages/<code>.json + a LOCALES
    // entry, with no code change here (FR2).
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
