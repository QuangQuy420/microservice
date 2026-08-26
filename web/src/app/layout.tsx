import type { Metadata } from "next";
import { Playfair_Display, Work_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { LocaleSync } from "@/components/i18n/LocaleSync";
import "./globals.css";

// NFR3: loaded via next/font/google (not a runtime <link> fetch) and exposed as CSS variables so
// globals.css can reference them from any class, not just page-scoped ones.
const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-playfair",
});

const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-worksans",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");

  return {
    title: "Smart Eyewear",
    description: t("siteDescription"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved from the NEXT_LOCALE cookie in src/i18n/request.ts (DEFAULT_LOCALE when unset,
  // AC11); drives both <html lang> and the messages every client component reads.
  const locale = await getLocale();

  return (
    <html lang={locale} className={`${playfairDisplay.variable} ${workSans.variable}`}>
      <body>
        <NextIntlClientProvider>
          <LocaleSync />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
