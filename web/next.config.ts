import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Picks up src/i18n/request.ts (next-intl's conventional path) — cookie-based locale, no routing
// integration, so URLs never gain a locale prefix.
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* config options here */
};

export default withNextIntl(nextConfig);
