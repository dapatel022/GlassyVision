# Week 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up Supabase schema (20 phase-1a tables), authentication with roles, Shopify commerce abstraction layer, Tailwind theme aligned with Bold Editorial Cool, and Vercel deployment pipeline — so that subsequent weeks can build features on a working foundation.

**Architecture:** Next.js 16 App Router with Supabase (DB + Auth + Storage) and Shopify Storefront/Admin APIs. All Shopify calls go through a single `lib/commerce/shopify.ts` module. Supabase client is initialized in `lib/supabase/`. Auth middleware protects `/admin` and `/lab` routes. Tailwind 4 theme is configured via `@theme {}` in globals.css using the Bold Editorial Cool palette.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Supabase JS SDK, Shopify Storefront API (GraphQL), Shopify Admin API (REST), Vitest, Google Fonts (Inter Tight, Fraunces, JetBrains Mono)

**Spec:** `docs/superpowers/specs/2026-04-11-glassyvision-phase1-design.md`

**Manual steps (not in this plan, done by founder in parallel):**
- Create Shopify Basic store on `glassyvision.com`, load 8 Drop 01 products with variants, configure metafields (is_rx_capable, frame measurements)
- Connect GitHub repo to Vercel for auto-deploy on push to `main`
- Create Supabase cloud project, copy credentials to `.env.local`
- Create Sentry project, copy DSN to `.env.local`
- Set up Resend account + verify `glassyvision.com` domain

---

## File Structure

```
src/
├── app/
│   ├── layout.tsx                    — root layout (fonts, providers, metadata)
│   ├── globals.css                   — Tailwind 4 theme (Bold Editorial Cool)
│   ├── page.tsx                      — temp landing (replaced in week 2)
│   ├── admin/
│   │   └── layout.tsx                — admin auth guard
│   ├── lab/
│   │   └── layout.tsx                — lab auth guard
│   └── api/
│       └── shopify/
│           └── webhooks/
│               └── route.ts          — Shopify webhook dispatcher
├── lib/
│   ├── commerce/
│   │   ├── shopify.ts                — Shopify API abstraction (all calls)
│   │   ├── shopify-storefront.ts     — Storefront API GraphQL queries
│   │   ├── shopify-admin.ts          — Admin API REST helpers
│   │   └── types.ts                  — commerce type definitions
│   ├── supabase/
│   │   ├── client.ts                 — browser Supabase client
│   │   ├── server.ts                 — server-side Supabase client
│   │   ├── admin.ts                  — service-role Supabase client
│   │   └── types.ts                  — generated DB types (placeholder until codegen)
│   ├── auth/
│   │   └── middleware.ts             — role-checking helpers
│   └── utils/
│       └── hmac.ts                   — Shopify webhook HMAC verification
├── middleware.ts                      — Next.js edge middleware (auth redirects)
supabase/
├── migrations/
│   ├── 00001_profiles.sql
│   ├── 00002_customers.sql
│   ├── 00003_orders.sql
│   ├── 00004_rx_files.sql
│   ├── 00005_rx_reviews.sql
│   ├── 00006_work_orders.sql
│   ├── 00007_lab_jobs.sql
│   ├── 00008_inventory.sql
│   ├── 00009_returns.sql
│   ├── 00010_communications.sql
│   ├── 00011_webhook_events.sql
│   ├── 00012_audit_log.sql
│   ├── 00013_drops.sql
│   ├── 00014_product_metadata.sql
│   ├── 00015_user_invitations.sql
│   ├── 00016_shipments.sql
│   ├── 00017_waitlist.sql
│   ├── 00018_rls_policies.sql
│   ├── 00019_functions_triggers.sql
│   └── 00020_storage_buckets.sql
├── seed.sql
└── config.toml
tests/
├── lib/
│   ├── commerce/
│   │   └── shopify.test.ts
│   ├── supabase/
│   │   └── client.test.ts
│   └── utils/
│       └── hmac.test.ts
└── setup.ts                          — test setup (env mocks)
.env.example                          — documented env vars
.env.local                            — local secrets (gitignored)
vitest.config.ts                      — vitest configuration
```

---

### Task 1: Install dependencies and configure tooling

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.env.local` (gitignored)
- Create: `tests/setup.ts`

- [ ] **Step 1: Install Supabase, Shopify, Resend, Sentry, and test dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr @sentry/nextjs resend
npm install -D vitest @vitejs/plugin-react supabase
```

- [ ] **Step 2: Create vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 3: Create test setup**

Create `tests/setup.ts`:

```typescript
import { vi } from 'vitest';

// Mock environment variables for tests
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SHOPIFY_STORE_DOMAIN = 'test-store.myshopify.com';
process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = 'test-storefront-token';
process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = 'test-admin-token';
process.env.SHOPIFY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.RESEND_API_KEY = 'test-resend-key';
```

- [ ] **Step 4: Create .env.example with documented variables**

Create `.env.example`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Shopify
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_STOREFRONT_ACCESS_TOKEN=your-storefront-token
SHOPIFY_ADMIN_ACCESS_TOKEN=your-admin-token
SHOPIFY_WEBHOOK_SECRET=your-webhook-secret

# Resend
RESEND_API_KEY=your-resend-key
RESEND_FROM_EMAIL=hello@glassyvision.com

# Sentry
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
SENTRY_AUTH_TOKEN=your-sentry-auth-token

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 5: Add test script to package.json**

Add to `package.json` scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui"
  }
}
```

- [ ] **Step 6: Initialize Sentry**

Run: `npx @sentry/wizard@latest -i nextjs`

This creates `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, and updates `next.config.ts` with `withSentryConfig`. Follow the wizard prompts — select the project from `.env.local` DSN.

If the wizard fails (common in non-interactive environments), create manually:

Create `sentry.client.config.ts`:

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
});
```

Create `sentry.server.config.ts`:

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
});
```

- [ ] **Step 7: Run tests to verify setup**

Run: `npm test`
Expected: no tests found (0 tests), clean exit

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup.ts .env.example
git commit -m "chore: install dependencies and configure vitest + env"
```

---

### Task 2: Configure Tailwind 4 theme — Bold Editorial Cool

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Replace globals.css with Bold Editorial Cool theme**

Replace the entire contents of `src/app/globals.css` with:

```css
@import "tailwindcss";

@theme {
  /* Bold Editorial Cool palette */
  --color-base: #f2f5f8;
  --color-base-deeper: #e8edf3;
  --color-ink: #0a0a0a;
  --color-ink-soft: #1a1a1a;
  --color-accent: #1a3a8a;
  --color-accent-light: #2d54b5;
  --color-tortoise: #c9b77a;
  --color-muted: #6a7888;
  --color-muted-soft: #8a96a4;
  --color-line: #dde3ea;
  --color-error: #c9302c;
  --color-success: #2d7a4f;
  --color-warning: #b06a00;

  /* Typography */
  --font-sans: 'Inter Tight', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-serif: 'Fraunces', ui-serif, Georgia, serif;
  --font-mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
}

:root {
  --background: #f2f5f8;
  --foreground: #0a0a0a;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: "ss01", "ss02", "cv11";
}

/* Utility animations */
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-20px); }
}

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slide {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

.animate-float { animation: float 6s ease-in-out infinite; }
.animate-fade-in-up { animation: fade-in-up 0.8s ease-out forwards; }
.animate-slide { animation: slide 40s linear infinite; }
```

- [ ] **Step 2: Update layout.tsx with Google Fonts and clean metadata**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Inter_Tight, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';

const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
  weight: ['400', '600', '800', '900'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  weight: ['400', '700'],
});

export const metadata: Metadata = {
  title: {
    default: 'GlassyVision — Eyewear, Dropped.',
    template: '%s | GlassyVision',
  },
  description:
    'Small-batch eyewear, hand-finished in India, shipped worldwide. Sunglasses and prescription glasses released in limited drops.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,400;1,300;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${interTight.variable} ${jetbrainsMono.variable} antialiased bg-base text-ink`}
      >
        {children}
      </body>
    </html>
  );
}
```

Note: Inter Tight and JetBrains Mono are loaded via `next/font/google` (optimized, self-hosted). Fraunces is loaded via `<link>` because `next/font/google` doesn't support Fraunces' italic variable axis well — this is a known issue. The `<link>` approach still works but adds a font-display: swap flash on first load.

- [ ] **Step 3: Create a minimal temp landing page**

Replace `src/app/page.tsx`:

```tsx
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-base">
      <div className="text-center space-y-6">
        <p className="font-mono text-[10px] font-bold tracking-[3px] uppercase text-accent">
          DROP Nº 01 · COMING SOON
        </p>
        <h1 className="font-sans text-7xl font-black tracking-tighter uppercase text-ink leading-[0.85]">
          GLASSY<br />VISION<span className="text-accent">.</span>
        </h1>
        <p className="font-serif italic text-base text-muted max-w-md mx-auto leading-relaxed">
          Small-batch eyewear, hand-finished in India, shipped worldwide.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verify the dev server renders the landing page**

Run: `npm run dev`
Open: `http://localhost:3000`
Expected: centered "GLASSYVISION." text with Inter Tight bold, Fraunces italic subtitle, cobalt accent dot, cool off-white background.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/app/page.tsx
git commit -m "feat: configure Bold Editorial Cool theme and temp landing"
```

---

### Task 3: Initialize Supabase and create DB schema migrations

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/00001_profiles.sql`
- Create: `supabase/migrations/00002_customers.sql`
- Create: `supabase/migrations/00003_orders.sql`
- Create: `supabase/migrations/00004_rx_files.sql`
- Create: `supabase/migrations/00005_rx_reviews.sql`
- Create: `supabase/migrations/00006_work_orders.sql`
- Create: `supabase/migrations/00007_lab_jobs.sql`
- Create: `supabase/migrations/00008_inventory.sql`
- Create: `supabase/migrations/00009_returns.sql`
- Create: `supabase/migrations/00010_communications.sql`
- Create: `supabase/migrations/00011_webhook_events.sql`
- Create: `supabase/migrations/00012_audit_log.sql`
- Create: `supabase/migrations/00013_drops.sql`
- Create: `supabase/migrations/00014_product_metadata.sql`
- Create: `supabase/migrations/00015_user_invitations.sql`
- Create: `supabase/migrations/00016_shipments.sql`
- Create: `supabase/migrations/00017_waitlist.sql`

- [ ] **Step 1: Initialize Supabase project locally**

```bash
npx supabase init
```

Expected: creates `supabase/` directory with `config.toml`

- [ ] **Step 2: Create profiles migration**

Create `supabase/migrations/00001_profiles.sql`:

```sql
-- Profiles: extends Supabase Auth users with role + display info
create type user_role as enum (
  'founder', 'reviewer', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping'
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  full_name text not null default '',
  role user_role not null default 'lab_operator',
  avatar_url text,
  last_active_at timestamptz,
  invitation_id uuid,
  timezone text default 'Asia/Kolkata',
  preferred_notification_channels jsonb default '["email"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();
```

- [ ] **Step 3: Create customers migration**

Create `supabase/migrations/00002_customers.sql`:

```sql
-- Customers: minimal mirror for ops + GDPR
create type vip_tier as enum ('none', 'returning', 'vip');

create table customers (
  id uuid primary key default gen_random_uuid(),
  shopify_customer_id bigint unique,
  email text not null,
  first_name text default '',
  last_name text default '',
  lifetime_value numeric(10,2) default 0,
  total_orders int default 0,
  first_order_at timestamptz,
  last_order_at timestamptz,
  vip_tier vip_tier not null default 'none',
  internal_notes text,
  flags jsonb default '{}'::jsonb,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_customers_shopify_id on customers(shopify_customer_id);
create index idx_customers_email on customers(email);

create trigger customers_updated_at
  before update on customers
  for each row execute function update_updated_at();
```

- [ ] **Step 4: Create orders + order_line_items migration**

Create `supabase/migrations/00003_orders.sql`:

```sql
-- Orders: mirror of Shopify orders (ops-relevant fields only)
create type order_financial_status as enum ('paid', 'refunded', 'partial_refund', 'pending');
create type order_fulfillment_status as enum ('unfulfilled', 'in_lab', 'shipped', 'delivered');
create type rx_status as enum ('none', 'awaiting_upload', 'uploaded_pending_review', 'approved', 'rejected');

create table orders (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id bigint unique not null,
  shopify_order_number text not null,
  customer_id uuid references customers(id),
  customer_email text not null,
  customer_name text not null default '',
  shipping_address jsonb,
  billing_country text check (billing_country in ('us', 'ca')),
  currency text not null default 'usd' check (currency in ('usd', 'cad')),
  subtotal numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  shipping_cost numeric(10,2) not null default 0,
  discount_code_used text,
  financial_status order_financial_status not null default 'paid',
  fulfillment_status order_fulfillment_status not null default 'unfulfilled',
  has_rx_items boolean not null default false,
  rx_status rx_status not null default 'none',
  drop_id uuid, -- fk added after drops table
  utm_source text,
  utm_medium text,
  utm_campaign text,
  first_order_ever boolean default false,
  notes_internal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_orders_shopify_id on orders(shopify_order_id);
create index idx_orders_customer_id on orders(customer_id);
create index idx_orders_rx_status on orders(rx_status) where has_rx_items = true;
create index idx_orders_fulfillment on orders(fulfillment_status);
create index idx_orders_created on orders(created_at desc);

create trigger orders_updated_at
  before update on orders
  for each row execute function update_updated_at();

-- Order line items: one row per variant ordered
create table order_line_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  shopify_line_item_id bigint not null,
  product_id bigint,
  variant_id bigint,
  product_handle text,
  product_title text not null,
  variant_title text,
  sku text,
  quantity int not null default 1,
  unit_price numeric(10,2) not null,
  line_total numeric(10,2) not null,
  is_rx_required boolean not null default false,
  frame_shape text,
  frame_color text,
  frame_size text
);

create index idx_line_items_order on order_line_items(order_id);
```

- [ ] **Step 5: Create rx_files migration**

Create `supabase/migrations/00004_rx_files.sql`:

```sql
-- Rx files: prescription uploads (PII, 3-year retention)
create type pd_type as enum ('mono', 'binocular');

create table rx_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  line_item_id uuid references order_line_items(id),
  customer_email text not null,
  storage_path text not null,
  original_filename text not null,
  file_size bigint not null,
  mime_type text not null,
  typed_od_sphere text,
  typed_od_cylinder text,
  typed_od_axis text,
  typed_od_add text,
  typed_os_sphere text,
  typed_os_cylinder text,
  typed_os_axis text,
  typed_os_add text,
  typed_pd text,
  typed_pd_type pd_type,
  rx_expiration_date date,
  certification_checked boolean not null default false,
  auto_check_results jsonb,
  checksum_sha256 text,
  scan_quality_score real,
  uploaded_at timestamptz not null default now(),
  uploaded_by_ip text,
  uploaded_by_user_agent text,
  deleted_at timestamptz -- soft delete, never hard delete before 3-year retention
);

create index idx_rx_files_order on rx_files(order_id);
create index idx_rx_files_pending on rx_files(uploaded_at)
  where deleted_at is null;
```

- [ ] **Step 6: Create rx_reviews migration**

Create `supabase/migrations/00005_rx_reviews.sql`:

```sql
-- Rx reviews: human decisions on Rx files
create type rx_decision as enum ('approved', 'rejected', 'needs_info');
create type rx_rejection_reason as enum (
  'clean_approved', 'matches_typed_values', 'image_too_blurry',
  'mismatch_typed_vs_image', 'expired_rx', 'suspicious',
  'wrong_document_type', 'other'
);

create table rx_reviews (
  id uuid primary key default gen_random_uuid(),
  rx_file_id uuid not null references rx_files(id),
  reviewer_user_id uuid not null references profiles(id),
  decision rx_decision not null,
  decision_reason rx_rejection_reason not null,
  notes text,
  reviewed_at timestamptz not null default now()
);

create index idx_rx_reviews_file on rx_reviews(rx_file_id);
```

- [ ] **Step 7: Create work_orders migration**

Create `supabase/migrations/00006_work_orders.sql`:

```sql
-- Work orders: generated after Rx approval, sent to lab
create type lens_type as enum ('single_vision', 'progressive', 'reading', 'non_prescription');
create type lens_material as enum ('cr39', 'polycarbonate', 'high_index_1_67', 'high_index_1_74');

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  line_item_id uuid not null references order_line_items(id),
  rx_file_id uuid references rx_files(id),
  work_order_number text unique not null,
  frame_sku text not null,
  frame_shape text,
  frame_color text,
  frame_size text,
  frame_eye_size numeric(5,1),
  frame_bridge_size numeric(5,1),
  frame_temple_length numeric(5,1),
  lens_type lens_type not null,
  lens_material lens_material not null default 'cr39',
  coatings jsonb default '[]'::jsonb,
  tint text default 'none',
  monocular_pd_od numeric(4,1),
  monocular_pd_os numeric(4,1),
  fitting_height numeric(4,1),
  decentration_h numeric(4,1),
  decentration_v numeric(4,1),
  base_curve numeric(4,2),
  ed_effective_diameter numeric(5,1),
  axis_double_entered boolean default false,
  special_instructions text,
  pdf_storage_path text,
  version int not null default 1,
  parent_work_order_id uuid references work_orders(id),
  created_at timestamptz not null default now(),
  released_to_lab_at timestamptz
);

create index idx_work_orders_order on work_orders(order_id);
create index idx_work_orders_number on work_orders(work_order_number);
```

- [ ] **Step 8: Create lab_jobs migration**

Create `supabase/migrations/00007_lab_jobs.sql`:

```sql
-- Lab jobs: kanban state per work order
create type kanban_column as enum (
  'inbox', 'ready_to_cut', 'on_edger', 'on_bench', 'qc', 'ship'
);

create table lab_jobs (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid unique not null references work_orders(id),
  "column" kanban_column not null default 'inbox',
  priority int not null default 5 check (priority between 0 and 10),
  assigned_to uuid references profiles(id),
  physical_tray_qr text,
  started_at timestamptz,
  completed_at timestamptz,
  qc_photos jsonb default '[]'::jsonb,
  lensometer_readings jsonb,
  shipment_id uuid, -- fk added after shipments table
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_lab_jobs_column on lab_jobs("column") where completed_at is null;
create index idx_lab_jobs_assigned on lab_jobs(assigned_to) where completed_at is null;

create trigger lab_jobs_updated_at
  before update on lab_jobs
  for each row execute function update_updated_at();
```

- [ ] **Step 9: Create inventory migration**

Create `supabase/migrations/00008_inventory.sql`:

```sql
-- Inventory pool: reserved stock per SKU variant
create table inventory_pool (
  id uuid primary key default gen_random_uuid(),
  shopify_product_id bigint not null,
  shopify_variant_id bigint unique not null,
  sku text not null,
  frame_shape text,
  color text,
  size text,
  pool_quantity int not null default 0 check (pool_quantity >= 0),
  threshold_alert int not null default 3,
  last_updated_by uuid references profiles(id),
  last_updated_at timestamptz not null default now()
);

create index idx_inventory_sku on inventory_pool(sku);

-- Inventory adjustments: audit trail for stock changes
create type adjustment_reason as enum (
  'initial_stock', 'restock', 'order_fulfilled', 'walk_in_depletion',
  'manual_correction', 'damaged', 'return_restock'
);

create table inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  inventory_pool_id uuid not null references inventory_pool(id),
  delta int not null,
  reason adjustment_reason not null,
  reference_order_id uuid references orders(id),
  user_id uuid not null references profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_adjustments_pool on inventory_adjustments(inventory_pool_id);
```

- [ ] **Step 10: Create returns migration**

Create `supabase/migrations/00009_returns.sql`:

```sql
-- Returns: customer return/replacement requests
create type return_request_type as enum ('return', 'replacement', 'remake');
create type return_reason as enum (
  'damaged', 'defective', 'wrong_size', 'wrong_rx_typed',
  'wrong_rx_our_fault', 'change_of_mind', 'other'
);
create type return_resolution as enum ('refund', 'replacement', 'store_credit');
create type return_admin_decision as enum (
  'pending', 'approved_refund', 'approved_replacement',
  'approved_credit', 'approved_remake', 'rejected'
);
create type return_status as enum ('pending', 'in_progress', 'completed', 'rejected');

create table returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  line_item_id uuid references order_line_items(id),
  customer_email text not null,
  rma_number text unique not null,
  request_type return_request_type not null,
  reason return_reason not null,
  reason_detail text,
  photo_urls jsonb default '[]'::jsonb,
  preferred_resolution return_resolution,
  admin_decision return_admin_decision not null default 'pending',
  admin_notes text,
  shopify_refund_id bigint,
  store_credit_amount numeric(10,2),
  replacement_work_order_id uuid references work_orders(id),
  return_shipment_id uuid, -- fk added after shipments table
  status return_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index idx_returns_order on returns(order_id);
create index idx_returns_status on returns(status) where status != 'completed';
```

- [ ] **Step 11: Create communications migration**

Create `supabase/migrations/00010_communications.sql`:

```sql
-- Communications: outbound email/SMS log
create type comm_channel as enum ('email', 'sms', 'push', 'webhook');
create type comm_direction as enum ('outbound', 'inbound');
create type comm_type as enum (
  'rx_reminder', 'rx_approved', 'rx_rejected', 'order_shipped',
  'return_approved', 'return_shipped', 'welcome', 'drop_launch',
  'review_request', 'rx_escalation', 'waitlist_notify', 'other'
);
create type comm_provider as enum ('resend', 'shopify', 'twilio');
create type comm_status as enum ('queued', 'sent', 'delivered', 'bounced', 'failed');

create table communications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  customer_email text not null,
  channel comm_channel not null default 'email',
  direction comm_direction not null default 'outbound',
  type comm_type not null,
  provider comm_provider not null default 'resend',
  provider_message_id text,
  subject text,
  body_hash text,
  status comm_status not null default 'queued',
  sent_at timestamptz,
  delivered_at timestamptz
);

create index idx_comms_order on communications(order_id);
create index idx_comms_idempotency on communications(order_id, type)
  where direction = 'outbound';
```

- [ ] **Step 12: Create webhook_events migration**

Create `supabase/migrations/00011_webhook_events.sql`:

```sql
-- Webhook events: inbound Shopify webhook idempotency
create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  shopify_event_id text unique not null,
  topic text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create index idx_webhooks_topic on webhook_events(topic);
create index idx_webhooks_unprocessed on webhook_events(received_at)
  where processed_at is null;
```

- [ ] **Step 13: Create audit_log migration**

Create `supabase/migrations/00012_audit_log.sql`:

```sql
-- Audit log: sensitive action trail
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index idx_audit_entity on audit_log(entity_type, entity_id);
create index idx_audit_user on audit_log(user_id);
create index idx_audit_created on audit_log(created_at desc);
```

- [ ] **Step 14: Create drops migration**

Create `supabase/migrations/00013_drops.sql`:

```sql
-- Drops: capsule collection lifecycle
create type drop_state as enum ('draft', 'scheduled', 'live', 'sold_out', 'closed');

create table drops (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  number int unique not null,
  hero_headline text,
  hero_copy text,
  hero_image_url text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  state drop_state not null default 'draft',
  total_capacity int,
  sold_count int not null default 0,
  revenue numeric(10,2) not null default 0,
  marketing_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger drops_updated_at
  before update on drops
  for each row execute function update_updated_at();

-- Add fk from orders to drops
alter table orders add constraint fk_orders_drop
  foreign key (drop_id) references drops(id);

-- Drop products: many-to-many
create type drop_feature_tier as enum ('hero', 'supporting');

create table drop_products (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references drops(id) on delete cascade,
  shopify_product_id bigint not null,
  display_order int not null default 0,
  feature_tier drop_feature_tier not null default 'supporting',
  unique (drop_id, shopify_product_id)
);
```

- [ ] **Step 15: Create product_metadata migration**

Create `supabase/migrations/00014_product_metadata.sql`:

```sql
-- Product metadata: cached Shopify product data for fast ops lookups
create table product_metadata (
  id uuid primary key default gen_random_uuid(),
  shopify_product_id bigint not null,
  shopify_variant_id bigint not null,
  sku text not null,
  frame_shape text,
  frame_material text,
  frame_eye_size numeric(5,1),
  frame_bridge numeric(5,1),
  frame_temple_length numeric(5,1),
  frame_total_width numeric(5,1),
  frame_weight_g numeric(5,1),
  base_curve numeric(4,2),
  lens_compatibility jsonb default '[]'::jsonb,
  is_rx_capable boolean not null default false,
  is_rx_sunglass_capable boolean not null default false,
  max_prescription_power numeric(4,1),
  last_synced_at timestamptz not null default now(),
  unique (shopify_product_id, shopify_variant_id)
);
```

- [ ] **Step 16: Create user_invitations migration**

Create `supabase/migrations/00015_user_invitations.sql`:

```sql
-- User invitations: lab staff onboarding
create table user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role user_role not null,
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  invited_by uuid not null references profiles(id),
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_profile_id uuid references profiles(id)
);

create index idx_invitations_token on user_invitations(token)
  where accepted_at is null;
```

- [ ] **Step 17: Create shipments migration**

Create `supabase/migrations/00016_shipments.sql`:

```sql
-- Shipments: physical package tracking
create type shipment_direction as enum ('outbound', 'return_inbound', 'replacement_outbound');
create type shipment_status as enum (
  'label_created', 'in_transit', 'delivered', 'exception', 'return_received'
);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  direction shipment_direction not null default 'outbound',
  carrier text,
  tracking_number text,
  tracking_url text,
  label_storage_path text,
  weight_g int,
  dimensions jsonb,
  cost_usd numeric(10,2),
  items jsonb not null default '[]'::jsonb,
  status shipment_status not null default 'label_created',
  shipped_at timestamptz,
  delivered_at timestamptz,
  commercial_invoice_path text,
  hs_code text default '9004.90',
  declared_value numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_shipments_order on shipments(order_id);
create index idx_shipments_tracking on shipments(tracking_number) where tracking_number is not null;

create trigger shipments_updated_at
  before update on shipments
  for each row execute function update_updated_at();

-- Add fks from lab_jobs and returns to shipments
alter table lab_jobs add constraint fk_lab_jobs_shipment
  foreign key (shipment_id) references shipments(id);

alter table returns add constraint fk_returns_shipment
  foreign key (return_shipment_id) references shipments(id);
```

- [ ] **Step 18: Create waitlist migration**

Create `supabase/migrations/00017_waitlist.sql`:

```sql
-- Waitlist: email capture scoped to drop or product
create type notify_trigger as enum ('launch', 'back_in_stock', 'next_drop');

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  drop_id uuid references drops(id),
  shopify_product_id bigint,
  notify_when notify_trigger not null default 'launch',
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  check (drop_id is not null or shopify_product_id is not null)
);

create index idx_waitlist_drop on waitlist(drop_id) where notified_at is null;
create index idx_waitlist_product on waitlist(shopify_product_id) where notified_at is null;
```

- [ ] **Step 19: Start Supabase locally and run all migrations**

```bash
npx supabase start
npx supabase db reset
```

Expected: all 17 migration files run successfully, local Postgres has all 20 tables (profiles, customers, orders, order_line_items, rx_files, rx_reviews, work_orders, lab_jobs, inventory_pool, inventory_adjustments, returns, communications, webhook_events, audit_log, drops, drop_products, product_metadata, user_invitations, shipments, waitlist).

- [ ] **Step 20: Commit all migrations**

```bash
git add supabase/
git commit -m "feat: add Supabase schema migrations for all 20 phase-1a tables"
```

---

### Task 4: Set up RLS policies and storage buckets

**Files:**
- Create: `supabase/migrations/00018_rls_policies.sql`
- Create: `supabase/migrations/00019_storage_buckets.sql`

- [ ] **Step 1: Create RLS policies**

Create `supabase/migrations/00018_rls_policies.sql`:

```sql
-- Enable RLS on all tables
alter table profiles enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_line_items enable row level security;
alter table rx_files enable row level security;
alter table rx_reviews enable row level security;
alter table work_orders enable row level security;
alter table lab_jobs enable row level security;
alter table inventory_pool enable row level security;
alter table inventory_adjustments enable row level security;
alter table returns enable row level security;
alter table communications enable row level security;
alter table webhook_events enable row level security;
alter table audit_log enable row level security;
alter table drops enable row level security;
alter table drop_products enable row level security;
alter table product_metadata enable row level security;
alter table user_invitations enable row level security;
alter table shipments enable row level security;
alter table waitlist enable row level security;

-- Helper: get current user's role
create or replace function auth.user_role()
returns user_role as $$
  select role from profiles where id = auth.uid()
$$ language sql security definer stable;

-- Helper: check if user has one of the given roles
create or replace function auth.has_role(allowed_roles user_role[])
returns boolean as $$
  select auth.user_role() = any(allowed_roles)
$$ language sql security definer stable;

-- Profiles: users can read own, founder can read all
create policy "Users can read own profile"
  on profiles for select using (id = auth.uid());
create policy "Founder can read all profiles"
  on profiles for select using (auth.user_role() = 'founder');
create policy "Users can update own profile"
  on profiles for update using (id = auth.uid());

-- Orders: customer sees own, ops roles see all
create policy "Founder/reviewer read all orders"
  on orders for select using (
    auth.has_role(array['founder', 'reviewer', 'lab_admin']::user_role[])
  );

-- Rx files: reviewer + founder can read/write, anon can insert via API (service role)
create policy "Founder/reviewer read rx_files"
  on rx_files for select using (
    auth.has_role(array['founder', 'reviewer']::user_role[])
  );

-- Rx reviews: reviewer/founder can insert
create policy "Reviewer can insert rx_reviews"
  on rx_reviews for insert with check (
    auth.has_role(array['founder', 'reviewer']::user_role[])
  );
create policy "Founder can read rx_reviews"
  on rx_reviews for select using (
    auth.has_role(array['founder', 'reviewer']::user_role[])
  );

-- Work orders: lab roles + founder can read
create policy "Lab and founder read work_orders"
  on work_orders for select using (
    auth.has_role(array['founder', 'reviewer', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping']::user_role[])
  );

-- Lab jobs: lab roles can read/update their scope
create policy "Lab roles read lab_jobs"
  on lab_jobs for select using (
    auth.has_role(array['founder', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping']::user_role[])
  );
create policy "Lab roles update lab_jobs"
  on lab_jobs for update using (
    auth.has_role(array['founder', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping']::user_role[])
  );

-- Inventory: lab_admin and founder can write, all lab can read
create policy "Lab reads inventory"
  on inventory_pool for select using (
    auth.has_role(array['founder', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping']::user_role[])
  );
create policy "Lab admin writes inventory"
  on inventory_pool for all using (
    auth.has_role(array['founder', 'lab_admin']::user_role[])
  );

-- Inventory adjustments: lab can insert, founder/admin can read
create policy "Lab inserts adjustments"
  on inventory_adjustments for insert with check (
    auth.has_role(array['founder', 'lab_admin', 'lab_operator']::user_role[])
  );
create policy "Founder reads adjustments"
  on inventory_adjustments for select using (
    auth.has_role(array['founder', 'lab_admin']::user_role[])
  );

-- Returns: founder can read/write all
create policy "Founder manages returns"
  on returns for all using (auth.user_role() = 'founder');

-- Communications: founder only
create policy "Founder reads communications"
  on communications for select using (auth.user_role() = 'founder');

-- Webhook events: service role only (no RLS policy needed, accessed via admin client)

-- Audit log: founder only
create policy "Founder reads audit_log"
  on audit_log for select using (auth.user_role() = 'founder');

-- Drops: public read, founder write
create policy "Public reads drops"
  on drops for select using (true);
create policy "Founder manages drops"
  on drops for all using (auth.user_role() = 'founder');

-- Drop products: public read
create policy "Public reads drop_products"
  on drop_products for select using (true);

-- Product metadata: public read
create policy "Public reads product_metadata"
  on product_metadata for select using (true);

-- Waitlist: anon can insert, founder can read
create policy "Anon inserts waitlist"
  on waitlist for insert with check (true);
create policy "Founder reads waitlist"
  on waitlist for select using (auth.user_role() = 'founder');

-- Shipments: lab and founder can read/write
create policy "Lab and founder manage shipments"
  on shipments for all using (
    auth.has_role(array['founder', 'lab_admin', 'lab_shipping']::user_role[])
  );

-- User invitations: founder can manage
create policy "Founder manages invitations"
  on user_invitations for all using (auth.user_role() = 'founder');
```

- [ ] **Step 2: Create storage buckets**

Create `supabase/migrations/00019_storage_buckets.sql`:

```sql
-- Storage buckets
insert into storage.buckets (id, name, public) values ('rx-files', 'rx-files', false);
insert into storage.buckets (id, name, public) values ('qc-photos', 'qc-photos', false);
insert into storage.buckets (id, name, public) values ('return-photos', 'return-photos', false);
insert into storage.buckets (id, name, public) values ('work-order-pdfs', 'work-order-pdfs', false);
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true);

-- RLS for rx-files bucket: reviewer/founder can read, service role writes (via signed URL)
create policy "Reviewer reads rx-files"
  on storage.objects for select using (
    bucket_id = 'rx-files' and
    auth.has_role(array['founder', 'reviewer']::user_role[])
  );

-- RLS for qc-photos: lab roles can write, founder/lab can read
create policy "Lab writes qc-photos"
  on storage.objects for insert with check (
    bucket_id = 'qc-photos' and
    auth.has_role(array['founder', 'lab_admin', 'lab_qc']::user_role[])
  );
create policy "Lab reads qc-photos"
  on storage.objects for select using (
    bucket_id = 'qc-photos' and
    auth.has_role(array['founder', 'lab_admin', 'lab_operator', 'lab_qc']::user_role[])
  );

-- Product images: public read
create policy "Public reads product-images"
  on storage.objects for select using (
    bucket_id = 'product-images'
  );
```

- [ ] **Step 3: Run migrations and verify**

```bash
npx supabase db reset
```

Expected: all 19 migrations run cleanly. Tables have RLS enabled. Storage buckets exist.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00018_rls_policies.sql supabase/migrations/00019_storage_buckets.sql
git commit -m "feat: add RLS policies and storage buckets"
```

---

### Task 5: Create Supabase client helpers

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/supabase/types.ts`
- Create: `tests/lib/supabase/client.test.ts`

- [ ] **Step 1: Write test for Supabase client creation**

Create `tests/lib/supabase/client.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}));

describe('Supabase clients', () => {
  it('createBrowserClient returns a client', async () => {
    const { createBrowserClient } = await import('@/lib/supabase/client');
    const client = createBrowserClient();
    expect(client).toBeDefined();
    expect(client.from).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/supabase/client.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create browser client**

Create `src/lib/supabase/client.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

let browserClient: ReturnType<typeof createClient<Database>> | null = null;

export function createBrowserClient() {
  if (browserClient) return browserClient;

  browserClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  return browserClient;
}
```

- [ ] **Step 4: Create server client**

Create `src/lib/supabase/server.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export function createServerClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
```

- [ ] **Step 5: Create admin (service role) client**

Create `src/lib/supabase/admin.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

let adminClient: ReturnType<typeof createClient<Database>> | null = null;

export function createAdminClient() {
  if (adminClient) return adminClient;

  adminClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return adminClient;
}
```

- [ ] **Step 6: Create placeholder types file**

Create `src/lib/supabase/types.ts`:

```typescript
// Placeholder until we run supabase gen types
// This will be replaced by generated types from `npx supabase gen types typescript`
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- tests/lib/supabase/client.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/supabase/ tests/lib/supabase/
git commit -m "feat: add Supabase client helpers (browser, server, admin)"
```

---

### Task 6: Create Shopify commerce abstraction layer

**Files:**
- Create: `src/lib/commerce/types.ts`
- Create: `src/lib/commerce/shopify-storefront.ts`
- Create: `src/lib/commerce/shopify-admin.ts`
- Create: `src/lib/commerce/shopify.ts`
- Create: `tests/lib/commerce/shopify.test.ts`

- [ ] **Step 1: Write test for Shopify product fetching**

Create `tests/lib/commerce/shopify.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Shopify Commerce Layer', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('getProducts returns typed products from Storefront API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          products: {
            edges: [
              {
                node: {
                  id: 'gid://shopify/Product/1',
                  handle: 'bombay-round',
                  title: 'Bombay Round',
                  description: 'Japanese acetate',
                  priceRange: {
                    minVariantPrice: { amount: '128.00', currencyCode: 'USD' },
                  },
                  images: { edges: [] },
                  variants: { edges: [] },
                },
              },
            ],
          },
        },
      }),
    });

    const { getProducts } = await import('@/lib/commerce/shopify');
    const products = await getProducts();

    expect(products).toHaveLength(1);
    expect(products[0].handle).toBe('bombay-round');
    expect(products[0].title).toBe('Bombay Round');
    expect(products[0].price).toBe('128.00');
  });

  it('getProductByHandle returns a single product', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          productByHandle: {
            id: 'gid://shopify/Product/1',
            handle: 'bombay-round',
            title: 'Bombay Round',
            description: 'Japanese acetate',
            descriptionHtml: '<p>Japanese acetate</p>',
            priceRange: {
              minVariantPrice: { amount: '128.00', currencyCode: 'USD' },
            },
            images: { edges: [] },
            variants: { edges: [] },
            metafields: [],
          },
        },
      }),
    });

    const { getProductByHandle } = await import('@/lib/commerce/shopify');
    const product = await getProductByHandle('bombay-round');

    expect(product).not.toBeNull();
    expect(product!.handle).toBe('bombay-round');
  });

  it('createCart returns a cart with checkout URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          cartCreate: {
            cart: {
              id: 'gid://shopify/Cart/1',
              checkoutUrl: 'https://test-store.myshopify.com/cart/c/abc123',
              lines: { edges: [] },
              cost: {
                totalAmount: { amount: '128.00', currencyCode: 'USD' },
                subtotalAmount: { amount: '128.00', currencyCode: 'USD' },
                totalTaxAmount: { amount: '0.00', currencyCode: 'USD' },
              },
            },
          },
        },
      }),
    });

    const { createCart } = await import('@/lib/commerce/shopify');
    const cart = await createCart([
      { merchandiseId: 'gid://shopify/ProductVariant/1', quantity: 1 },
    ]);

    expect(cart.checkoutUrl).toContain('myshopify.com');
    expect(cart.id).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/commerce/shopify.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Create commerce types**

Create `src/lib/commerce/types.ts`:

```typescript
export interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  description: string;
  descriptionHtml?: string;
  price: string;
  currencyCode: string;
  images: ShopifyImage[];
  variants: ShopifyVariant[];
  metafields?: ShopifyMetafield[];
}

export interface ShopifyImage {
  url: string;
  altText: string | null;
  width: number;
  height: number;
}

export interface ShopifyVariant {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  availableForSale: boolean;
  selectedOptions: { name: string; value: string }[];
}

export interface ShopifyMetafield {
  key: string;
  value: string;
  namespace: string;
}

export interface CartLineInput {
  merchandiseId: string;
  quantity: number;
  attributes?: { key: string; value: string }[];
}

export interface ShopifyCart {
  id: string;
  checkoutUrl: string;
  lines: CartLine[];
  totalAmount: string;
  subtotalAmount: string;
  totalTaxAmount: string;
  currencyCode: string;
}

export interface CartLine {
  id: string;
  quantity: number;
  merchandiseId: string;
  title: string;
  price: string;
}
```

- [ ] **Step 4: Create Storefront API helper**

Create `src/lib/commerce/shopify-storefront.ts`:

```typescript
const STOREFRONT_API_VERSION = '2025-01';

export async function storefrontFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN!;
  const token = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN!;

  const response = await fetch(
    `https://${domain}/api/${STOREFRONT_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  if (!response.ok) {
    throw new Error(`Storefront API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();

  if (json.errors) {
    throw new Error(`Storefront API GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  return json.data as T;
}

// --- Queries ---

export const PRODUCTS_QUERY = `
  query Products($first: Int = 50) {
    products(first: $first) {
      edges {
        node {
          id
          handle
          title
          description
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 10) {
            edges {
              node {
                url
                altText
                width
                height
              }
            }
          }
          variants(first: 50) {
            edges {
              node {
                id
                title
                sku
                price { amount currencyCode }
                availableForSale
                selectedOptions { name value }
              }
            }
          }
        }
      }
    }
  }
`;

export const PRODUCT_BY_HANDLE_QUERY = `
  query ProductByHandle($handle: String!) {
    productByHandle(handle: $handle) {
      id
      handle
      title
      description
      descriptionHtml
      priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
      }
      images(first: 10) {
        edges {
          node {
            url
            altText
            width
            height
          }
        }
      }
      variants(first: 50) {
        edges {
          node {
            id
            title
            sku
            price { amount currencyCode }
            availableForSale
            selectedOptions { name value }
          }
        }
      }
      metafields(identifiers: [
        { namespace: "custom", key: "is_rx_capable" },
        { namespace: "custom", key: "frame_eye_size" },
        { namespace: "custom", key: "frame_bridge" },
        { namespace: "custom", key: "frame_temple_length" }
      ]) {
        key
        value
        namespace
      }
    }
  }
`;

export const CART_CREATE_MUTATION = `
  mutation CartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        id
        checkoutUrl
        lines(first: 50) {
          edges {
            node {
              id
              quantity
              merchandise {
                ... on ProductVariant {
                  id
                  title
                  price { amount currencyCode }
                }
              }
            }
          }
        }
        cost {
          totalAmount { amount currencyCode }
          subtotalAmount { amount currencyCode }
          totalTaxAmount { amount currencyCode }
        }
      }
    }
  }
`;
```

- [ ] **Step 5: Create Admin API helper**

Create `src/lib/commerce/shopify-admin.ts`:

```typescript
const ADMIN_API_VERSION = '2025-01';

export async function adminFetch<T>(
  endpoint: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN!;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
  const method = options.method || 'GET';

  const response = await fetch(
    `https://${domain}/admin/api/${ADMIN_API_VERSION}/${endpoint}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Admin API error: ${response.status} ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

export async function updateInventoryLevel(
  inventoryItemId: string,
  locationId: string,
  quantity: number,
) {
  return adminFetch('inventory_levels/set.json', {
    method: 'POST',
    body: {
      location_id: locationId,
      inventory_item_id: inventoryItemId,
      available: quantity,
    },
  });
}

export async function createFulfillment(
  orderId: number,
  trackingNumber: string,
  trackingCompany: string,
  lineItemIds: number[],
) {
  return adminFetch(`orders/${orderId}/fulfillments.json`, {
    method: 'POST',
    body: {
      fulfillment: {
        tracking_number: trackingNumber,
        tracking_company: trackingCompany,
        line_items: lineItemIds.map((id) => ({ id })),
      },
    },
  });
}

export async function createRefund(
  orderId: number,
  amount: number,
  currency: string,
  note: string,
) {
  return adminFetch(`orders/${orderId}/refunds.json`, {
    method: 'POST',
    body: {
      refund: {
        currency,
        note,
        shipping: { amount: '0.00' },
        transactions: [{ kind: 'refund', amount: amount.toFixed(2) }],
      },
    },
  });
}
```

- [ ] **Step 6: Create unified commerce module**

Create `src/lib/commerce/shopify.ts`:

```typescript
import type { ShopifyProduct, ShopifyCart, CartLineInput, ShopifyImage, ShopifyVariant, ShopifyMetafield } from './types';
import { storefrontFetch, PRODUCTS_QUERY, PRODUCT_BY_HANDLE_QUERY, CART_CREATE_MUTATION } from './shopify-storefront';
import { adminFetch, updateInventoryLevel, createFulfillment, createRefund } from './shopify-admin';

// --- Storefront (read) ---

function mapProduct(node: any): ShopifyProduct {
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description,
    descriptionHtml: node.descriptionHtml,
    price: node.priceRange.minVariantPrice.amount,
    currencyCode: node.priceRange.minVariantPrice.currencyCode,
    images: (node.images?.edges || []).map((e: any) => e.node as ShopifyImage),
    variants: (node.variants?.edges || []).map((e: any) => ({
      id: e.node.id,
      title: e.node.title,
      sku: e.node.sku,
      price: e.node.price.amount,
      availableForSale: e.node.availableForSale,
      selectedOptions: e.node.selectedOptions,
    })) as ShopifyVariant[],
    metafields: (node.metafields || []).filter(Boolean) as ShopifyMetafield[],
  };
}

export async function getProducts(first = 50): Promise<ShopifyProduct[]> {
  const data = await storefrontFetch<any>(PRODUCTS_QUERY, { first });
  return data.products.edges.map((e: any) => mapProduct(e.node));
}

export async function getProductByHandle(handle: string): Promise<ShopifyProduct | null> {
  const data = await storefrontFetch<any>(PRODUCT_BY_HANDLE_QUERY, { handle });
  if (!data.productByHandle) return null;
  return mapProduct(data.productByHandle);
}

export async function createCart(lines: CartLineInput[]): Promise<ShopifyCart> {
  const data = await storefrontFetch<any>(CART_CREATE_MUTATION, {
    input: {
      lines: lines.map((l) => ({
        merchandiseId: l.merchandiseId,
        quantity: l.quantity,
        ...(l.attributes ? { attributes: l.attributes } : {}),
      })),
    },
  });

  const cart = data.cartCreate.cart;
  return {
    id: cart.id,
    checkoutUrl: cart.checkoutUrl,
    lines: (cart.lines?.edges || []).map((e: any) => ({
      id: e.node.id,
      quantity: e.node.quantity,
      merchandiseId: e.node.merchandise.id,
      title: e.node.merchandise.title,
      price: e.node.merchandise.price.amount,
    })),
    totalAmount: cart.cost.totalAmount.amount,
    subtotalAmount: cart.cost.subtotalAmount.amount,
    totalTaxAmount: cart.cost.totalTaxAmount?.amount || '0.00',
    currencyCode: cart.cost.totalAmount.currencyCode,
  };
}

// --- Admin (write) ---

export { updateInventoryLevel, createFulfillment, createRefund };
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- tests/lib/commerce/shopify.test.ts`
Expected: all 3 tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/commerce/ tests/lib/commerce/
git commit -m "feat: add Shopify commerce abstraction layer (storefront + admin)"
```

---

### Task 7: Create webhook HMAC verification and dispatcher

**Files:**
- Create: `src/lib/utils/hmac.ts`
- Create: `src/app/api/shopify/webhooks/route.ts`
- Create: `tests/lib/utils/hmac.test.ts`

- [ ] **Step 1: Write test for HMAC verification**

Create `tests/lib/utils/hmac.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { verifyShopifyWebhook } from '@/lib/utils/hmac';
import { createHmac } from 'crypto';

describe('verifyShopifyWebhook', () => {
  const secret = 'test-webhook-secret';
  const body = '{"test": true}';

  it('returns true for valid HMAC', () => {
    const hmac = createHmac('sha256', secret)
      .update(body, 'utf-8')
      .digest('base64');

    expect(verifyShopifyWebhook(body, hmac, secret)).toBe(true);
  });

  it('returns false for invalid HMAC', () => {
    expect(verifyShopifyWebhook(body, 'invalid-hmac', secret)).toBe(false);
  });

  it('returns false for empty HMAC', () => {
    expect(verifyShopifyWebhook(body, '', secret)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/utils/hmac.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement HMAC verification**

Create `src/lib/utils/hmac.ts`:

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

export function verifyShopifyWebhook(
  body: string,
  hmacHeader: string,
  secret: string,
): boolean {
  if (!hmacHeader || !body || !secret) return false;

  try {
    const computed = createHmac('sha256', secret)
      .update(body, 'utf-8')
      .digest('base64');

    return timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(hmacHeader),
    );
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/utils/hmac.test.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Create webhook route dispatcher**

Create `src/app/api/shopify/webhooks/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyWebhook } from '@/lib/utils/hmac';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const hmac = request.headers.get('x-shopify-hmac-sha256') || '';
  const topic = request.headers.get('x-shopify-topic') || '';
  const shopifyEventId = request.headers.get('x-shopify-webhook-id') || '';

  // Verify HMAC
  if (!verifyShopifyWebhook(body, hmac, process.env.SHOPIFY_WEBHOOK_SECRET!)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const payload = JSON.parse(body);

  // Idempotency check
  if (shopifyEventId) {
    const { data: existing } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('shopify_event_id', shopifyEventId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ status: 'already_processed' });
    }
  }

  // Log the event
  const { data: event } = await supabase
    .from('webhook_events')
    .insert({
      shopify_event_id: shopifyEventId || crypto.randomUUID(),
      topic,
      payload,
    })
    .select('id')
    .single();

  try {
    // Dispatch to topic-specific handlers
    // Handlers will be added in Week 3 (Task: webhook handlers)
    switch (topic) {
      case 'orders/create':
        // TODO: Week 3 — mirror order, send Rx reminder
        break;
      case 'orders/updated':
        // TODO: Week 3 — update order mirror
        break;
      case 'orders/cancelled':
        // TODO: Week 3 — cancel pending work orders
        break;
      case 'products/update':
        // TODO: Week 3 — refresh product_metadata cache
        break;
      default:
        console.log(`Unhandled webhook topic: ${topic}`);
    }

    // Mark as processed
    if (event) {
      await supabase
        .from('webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', event.id);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    // Log error but return 200 (Shopify retries on non-2xx)
    if (event) {
      await supabase
        .from('webhook_events')
        .update({
          processing_error: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', event.id);
    }

    return NextResponse.json({ status: 'error_logged' });
  }
}
```

Note: the `switch` cases have TODO comments for Week 3 handlers. This is intentional — the dispatcher structure is complete but the handlers are out of scope for Week 1. The TODOs reference the exact week and task where they'll be filled in.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/hmac.ts src/app/api/shopify/webhooks/route.ts tests/lib/utils/hmac.test.ts
git commit -m "feat: add Shopify webhook HMAC verification and dispatcher"
```

---

### Task 8: Create auth middleware for /admin and /lab routes

**Files:**
- Create: `src/lib/auth/middleware.ts`
- Create: `src/middleware.ts`
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/lab/layout.tsx`

- [ ] **Step 1: Create role-checking helpers**

Create `src/lib/auth/middleware.ts`:

```typescript
import { createServerClient } from '@/lib/supabase/server';

export type UserRole = 'founder' | 'reviewer' | 'lab_admin' | 'lab_operator' | 'lab_qc' | 'lab_shipping';

const ADMIN_ROLES: UserRole[] = ['founder', 'reviewer'];
const LAB_ROLES: UserRole[] = ['founder', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping'];

export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function isLabRole(role: UserRole): boolean {
  return LAB_ROLES.includes(role);
}

export async function getCurrentUser() {
  const supabase = createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    email: user.email!,
    role: profile.role as UserRole,
    fullName: profile.full_name,
  };
}
```

- [ ] **Step 2: Create Next.js edge middleware**

Create `src/middleware.ts`:

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /admin and /lab routes
  if (!pathname.startsWith('/admin') && !pathname.startsWith('/lab')) {
    return NextResponse.next();
  }

  // Check for auth cookie (Supabase stores JWT in cookies)
  const accessToken = request.cookies.get('sb-access-token')?.value;

  if (!accessToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Let the route-level layout handle role checking
  // (middleware can't do async DB lookups efficiently at the edge)
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/lab/:path*'],
};
```

- [ ] **Step 3: Create admin layout with role guard**

Create `src/app/admin/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getCurrentUser, isAdminRole } from '@/lib/auth/middleware';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/admin');
  }

  if (!isAdminRole(user.role)) {
    redirect('/unauthorized');
  }

  return (
    <div className="min-h-screen bg-base">
      <header className="sticky top-0 z-50 bg-ink text-base px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-sans font-black text-sm tracking-wider uppercase">
            GlassyVision<span className="text-accent">.</span> Admin
          </span>
        </div>
        <div className="font-mono text-xs text-muted-soft">
          {user.fullName || user.email} · {user.role}
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Create lab layout with role guard**

Create `src/app/lab/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getCurrentUser, isLabRole } from '@/lib/auth/middleware';

export default async function LabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/lab');
  }

  if (!isLabRole(user.role)) {
    redirect('/unauthorized');
  }

  return (
    <div className="min-h-screen bg-base">
      <header className="sticky top-0 z-50 bg-ink text-base px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-sans font-black text-sm tracking-wider uppercase">
            GlassyVision<span className="text-tortoise">.</span> Lab
          </span>
        </div>
        <div className="font-mono text-xs text-muted-soft">
          {user.fullName || user.email} · {user.role}
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Create placeholder pages for admin and lab**

Create `src/app/admin/page.tsx`:

```tsx
export default function AdminDashboard() {
  return (
    <div>
      <h1 className="font-sans text-3xl font-black tracking-tight uppercase text-ink mb-2">
        Admin Dashboard
      </h1>
      <p className="font-serif italic text-muted">
        Rx review queue, orders, returns, and drop management — coming in Week 3.
      </p>
    </div>
  );
}
```

Create `src/app/lab/page.tsx`:

```tsx
export default function LabDashboard() {
  return (
    <div>
      <h1 className="font-sans text-3xl font-black tracking-tight uppercase text-ink mb-2">
        Lab Dashboard
      </h1>
      <p className="font-serif italic text-muted">
        Job kanban, inventory, and shipping — coming in Week 4.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Create minimal login page**

The middleware redirects unauthenticated users to `/login`. Create a placeholder so the redirect doesn't 404.

Create `src/app/login/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Redirect to the page they were trying to access
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect') || '/admin';
    window.location.href = redirect;
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-base">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink">
            GlassyVision<span className="text-accent">.</span>
          </h1>
          <p className="font-serif italic text-muted text-sm mt-2">
            Team login
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 bg-white border border-line text-ink font-sans text-sm focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 bg-white border border-line text-ink font-sans text-sm focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none"
          />
          {error && (
            <p className="text-error text-xs font-mono">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-ink text-base font-sans font-bold text-xs tracking-widest uppercase disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </main>
  );
}
```

Create `src/app/unauthorized/page.tsx`:

```tsx
import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-base">
      <div className="text-center space-y-4">
        <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink">
          403
        </h1>
        <p className="font-serif italic text-muted">
          You don't have permission to access this page.
        </p>
        <Link
          href="/"
          className="inline-block mt-4 px-6 py-2 bg-ink text-base font-sans font-bold text-xs tracking-widest uppercase"
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/ src/middleware.ts src/app/admin/ src/app/lab/ src/app/login/ src/app/unauthorized/
git commit -m "feat: add auth middleware, role-guarded layouts, login + unauthorized pages"
```

---

### Task 9: Create seed data and verify full stack

**Files:**
- Create: `supabase/seed.sql`

- [ ] **Step 1: Create seed data**

Create `supabase/seed.sql`:

```sql
-- Seed data for local development
-- Run with: npx supabase db reset (automatically runs seed.sql after migrations)

-- Create a test founder user (password: testtest)
-- Note: in local dev, create via Supabase Auth UI at localhost:54323
-- This seed only creates the profile row, assuming the auth user exists

-- Insert a test drop
insert into drops (slug, name, number, hero_headline, hero_copy, starts_at, ends_at, state) values
  ('the-first-run', 'The First Run', 1, 'THE FIRST RUN.', 'Eight frames. Hand-finished in a small shop in India.', now(), now() + interval '14 days', 'live');

-- Insert test product metadata
insert into product_metadata (shopify_product_id, shopify_variant_id, sku, frame_shape, frame_material, frame_eye_size, frame_bridge, frame_temple_length, is_rx_capable, is_rx_sunglass_capable) values
  (1001, 2001, 'BOM-RND-TOR', 'round', 'acetate', 49, 21, 145, true, true),
  (1002, 2002, 'JAI-OVL-BLK', 'oval', 'titanium', 51, 19, 140, true, true),
  (1003, 2003, 'KOC-SQR-NAV', 'square', 'acetate', 52, 20, 148, true, true),
  (1004, 2004, 'UDA-AVI-GLD', 'aviator', 'steel', 58, 14, 140, false, false),
  (1005, 2005, 'VAR-CAT-TOR', 'cat-eye', 'acetate', 53, 17, 142, true, true);

-- Insert test inventory
insert into inventory_pool (shopify_product_id, shopify_variant_id, sku, frame_shape, color, size, pool_quantity, threshold_alert) values
  (1001, 2001, 'BOM-RND-TOR', 'round', 'tortoise', 'M', 10, 3),
  (1002, 2002, 'JAI-OVL-BLK', 'oval', 'black', 'M', 8, 3),
  (1003, 2003, 'KOC-SQR-NAV', 'square', 'navy', 'L', 12, 3),
  (1004, 2004, 'UDA-AVI-GLD', 'aviator', 'gold', 'L', 15, 3),
  (1005, 2005, 'VAR-CAT-TOR', 'cat-eye', 'tortoise', 'M', 7, 3);

-- Insert test drop_products
insert into drop_products (drop_id, shopify_product_id, display_order, feature_tier) values
  ((select id from drops where slug = 'the-first-run'), 1001, 1, 'hero'),
  ((select id from drops where slug = 'the-first-run'), 1002, 2, 'hero'),
  ((select id from drops where slug = 'the-first-run'), 1003, 3, 'supporting'),
  ((select id from drops where slug = 'the-first-run'), 1004, 4, 'supporting'),
  ((select id from drops where slug = 'the-first-run'), 1005, 5, 'hero');
```

- [ ] **Step 2: Reset Supabase with seed data**

```bash
npx supabase db reset
```

Expected: all migrations run, seed data inserted, 5 products + 1 drop + inventory visible in Supabase Studio at `http://localhost:54323`.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests pass (HMAC, Supabase client, Shopify commerce layer).

- [ ] **Step 4: Run dev server and verify**

```bash
npm run dev
```

Verify:
1. `http://localhost:3000` — shows Bold Editorial Cool landing page
2. `http://localhost:3000/admin` — redirects to `/login` (no auth yet)
3. `http://localhost:3000/lab` — redirects to `/login` (no auth yet)
4. Supabase Studio at `http://localhost:54323` — tables, seed data, storage buckets visible

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

Expected: no errors (warnings are fine).

- [ ] **Step 6: Final commit for Week 1**

```bash
git add supabase/seed.sql
git commit -m "feat: add seed data and verify full stack"
```

- [ ] **Step 7: Tag the Week 1 milestone**

```bash
git tag -a week-1-foundation -m "Week 1 complete: Supabase schema (20 tables), auth middleware, Shopify commerce layer, Bold Editorial Cool theme, webhook dispatcher"
```

---

## Week 1 Completion Checklist

- [ ] 20 Supabase tables migrated with RLS policies
- [ ] 5 storage buckets created (rx-files, qc-photos, return-photos, work-order-pdfs, product-images)
- [ ] Supabase Auth configured with role enum
- [ ] Shopify commerce abstraction (`getProducts`, `getProductByHandle`, `createCart`, `updateInventoryLevel`, `createFulfillment`, `createRefund`)
- [ ] Webhook dispatcher with HMAC verification and idempotency
- [ ] Auth middleware protecting `/admin` and `/lab` routes
- [ ] Bold Editorial Cool theme (Inter Tight, Fraunces, JetBrains Mono, full palette)
- [ ] Vitest configured, all tests passing
- [ ] Seed data for local development
- [ ] Sentry + Vercel pipeline (manual verification)
- [ ] Clean git history with descriptive commits
