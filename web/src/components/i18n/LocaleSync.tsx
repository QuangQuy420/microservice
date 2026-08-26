"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Mounted once in the root layout. saveLocale() (src/lib/i18n/locale.ts) writes the NEXT_LOCALE
// cookie and fires "locale-change"; this turns that into a soft router.refresh() so the server
// re-renders the layout with the new messages. React state (cart, forms, the session) survives a
// refresh — no redirect, no reload, no logout (NFR3).
export function LocaleSync() {
  const router = useRouter();

  useEffect(() => {
    function handleLocaleChange() {
      router.refresh();
    }

    window.addEventListener("locale-change", handleLocaleChange);

    return () => {
      window.removeEventListener("locale-change", handleLocaleChange);
    };
  }, [router]);

  return null;
}
