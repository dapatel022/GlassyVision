import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Cloud Run runs a container: emit the self-contained server (server.js +
  // minimal node_modules) that the Dockerfile's run stage copies.
  output: "standalone",
  // Without this, Next infers a workspace root above the project (stray parent
  // lockfile) and nests standalone output under GLASS_APP/glass-app/.
  outputFileTracingRoot: process.cwd(),
  images: {
    remotePatterns: [
      // Shopify CDN (product images from the Storefront API)
      { protocol: "https", hostname: "cdn.shopify.com" },
      // Unsplash (preset model faces used by the virtual try-on)
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Force HTTPS for 2 years incl. subdomains (Cloud Run terminates TLS).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // The storefront is never legitimately embedded in another site.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // camera=self: the virtual try-on + webcam PD measurement need it.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

// withSentryConfig is a no-op for source-map upload unless SENTRY_ORG/PROJECT/
// AUTH_TOKEN are set, so it's safe to wrap unconditionally.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
});
