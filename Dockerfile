# GlassyVision — Cloud Run image (docs/launch/2026-07-17-gcp-cloud-run-deployment-plan.md §1.2)

# ---- deps ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are baked into the client bundle at build time. The anon
# key is public by design (RLS is the boundary); none of these are secrets.
# The Shopify Storefront token/domain are public-class credentials
# (unauthenticated_* scopes only) supplied at build so ISR prerenders bake
# LIVE prices instead of fail-closed nulls that starve on Cloud Run's
# throttled background revalidation. Server secrets stay runtime-only.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_BASE_URL
ARG SHOPIFY_STORE_DOMAIN
ARG SHOPIFY_STOREFRONT_ACCESS_TOKEN
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL \
    SHOPIFY_STORE_DOMAIN=$SHOPIFY_STORE_DOMAIN \
    SHOPIFY_STOREFRONT_ACCESS_TOKEN=$SHOPIFY_STOREFRONT_ACCESS_TOKEN
# Sentry source-map upload is a no-op unless SENTRY_* are set (see next.config)
RUN npm run build

# ---- run ----
FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run injects PORT (default 8080); Next standalone reads process.env.PORT
ENV PORT=8080
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 8080
CMD ["node", "server.js"]
