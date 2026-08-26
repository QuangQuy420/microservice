import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config";

// Client-side counterpart of src/i18n/request.ts: reads/writes the NEXT_LOCALE cookie the server
// renders from, and announces the change the same way session.ts announces "auth-change" so the
// app can re-render without a redirect or a reload (NFR3). LocaleSync is the listener.

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

function dispatchLocaleChange(): void {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("locale-change"));
    }
}

export function getLocale(): Locale {
    if (typeof document === "undefined") return DEFAULT_LOCALE;

    const match = document.cookie.match(
        new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`),
    );
    const value = match ? decodeURIComponent(match[1]) : null;

    return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function saveLocale(locale: Locale): void {
    if (typeof document === "undefined") return;

    document.cookie =
        `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; samesite=lax`;
    document.documentElement.lang = locale;
    dispatchLocaleChange();
}
