"use client";

import { useLocale } from "next-intl";
import { LOCALES, type Locale } from "@/i18n/config";
import { saveLocale } from "@/lib/i18n/locale";
import { updateMyProfile } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { cn } from "@/lib/cn";

// Language names are rendered in their own language via Intl.DisplayNames rather than a hardcoded
// label map, so a new locale shows up in the switcher from its LOCALES entry alone (AC6).
function localeLabel(locale: Locale): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: "language" }).of(locale);
    if (name) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    // Intl.DisplayNames unavailable for this locale — fall through to the raw code.
  }
  return locale.toUpperCase();
}

const OPTION_CLASS =
  "min-h-9 cursor-pointer rounded-full border-0 bg-transparent px-[0.6rem] font-body text-[0.78rem] " +
  "font-[650] tracking-[0.04em] uppercase transition-colors duration-200 ease-[ease]";

// Guests keep their choice in the NEXT_LOCALE cookie; a logged-in user also gets it saved on the
// account so a fresh browser applies it at login (FR6, AC1/AC2). The profile call is best-effort:
// the UI must switch even if the save fails.
export function LanguageSwitcher() {
  const activeLocale = useLocale() as Locale;

  function handleSelect(locale: Locale) {
    if (locale === activeLocale) return;

    saveLocale(locale);

    const token = getAccessToken();
    if (token) {
      void updateMyProfile(token, { preferredLanguage: locale }).catch(() => {
        // Keeping the switch working offline/unauthorized matters more than the persisted value.
      });
    }
  }

  return (
    <div
      className="flex items-center rounded-full border border-border bg-surface p-[0.15rem]"
      role="group"
    >
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          className={cn(
            OPTION_CLASS,
            locale === activeLocale
              ? "bg-text text-surface"
              : "text-text-secondary hover:text-text",
          )}
          onClick={() => handleSelect(locale)}
          aria-pressed={locale === activeLocale}
          title={localeLabel(locale)}
        >
          {locale.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
