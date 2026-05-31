import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Shopify CDN (product images from the Storefront API)
      { protocol: "https", hostname: "cdn.shopify.com" },
      // Unsplash (preset model faces used by the virtual try-on)
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

// withSentryConfig is a no-op for source-map upload unless SENTRY_ORG/PROJECT/
// AUTH_TOKEN are set, so it's safe to wrap unconditionally.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  disableLogger: true,
});
