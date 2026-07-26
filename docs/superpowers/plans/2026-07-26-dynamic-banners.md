# Unified Dynamic Banner System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six merchant-managed banner slots (announcement / plp_grid / quiz_results / cart / pdp / thanks) powered by one `banner` metaobject type, plus rendering the collection image as a PLP header banner. Every slot renders nothing when unconfigured.

**Architecture:** `getBanners()` in `src/lib/commerce/content.ts` (grouped by slot, active-only, order-sorted, CTA URLs through the menu system's `transformMenuUrl` allowlist); `AnnouncementBar`/`PromoBanner`/`PromoTile` components; slot wiring in layout, PLP, PDP, thanks, and a cart server-wrapper refactor. Spec: `docs/superpowers/specs/2026-07-26-dynamic-banners-design.md`.

**Tech Stack:** Next.js 16 App Router, Storefront GraphQL `2025-01`, Vitest.

## Global Constraints

- All Shopify GraphQL in `src/lib/commerce/`; version `2025-01`.
- Every slot degrades to "renders nothing" on error/empty — `getBanners` returns `{}` + `console.warn`, never throws.
- Banner CTA URLs are untrusted merchant input: MUST go through `transformMenuUrl` from `./menu` (scheme allowlist + internal route mapping). A CTA whose URL transforms to null renders the banner WITHOUT a CTA (title/body still show).
- Cart refactor moves client logic verbatim — no behavior change to cart/checkout; that's the regression gate.
- jsx-a11y enforced; decorative images `alt="" aria-hidden`; links have discernible text.
- Tests under `tests/lib/commerce/`; baseline 485 green; lint/tsc/build clean before every commit; commits via HEREDOC.
- Only files named per task.

---

### Task 1: `getBanners` in content.ts (TDD)

**Files:**
- Modify: `src/lib/commerce/content.ts` (append)
- Modify: `src/lib/commerce/shopify-storefront.ts` (append `BANNERS_QUERY`)
- Test: `tests/lib/commerce/banners.test.ts`

**Interfaces:**
- Consumes: `storefrontFetch`; `transformMenuUrl` from `./menu`.
- Produces (Tasks 2–4 rely on exact names): `BANNER_SLOTS` const, `SiteBanner { slot: string; title: string; body: string | null; cta: { href: string; label: string; external: boolean } | null; imageUrl: string | null }`, `getBanners(): Promise<Record<string, SiteBanner[]>>`.

- [ ] **Step 1: Write the failing tests** — `tests/lib/commerce/banners.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorefrontFetch = vi.fn();
vi.mock('@/lib/commerce/shopify-storefront', () => ({
  storefrontFetch: mockStorefrontFetch,
  HERO_SLIDES_QUERY: 'HERO_SLIDES_QUERY',
  HOMEPAGE_QUERY: 'HOMEPAGE_QUERY',
  BANNERS_QUERY: 'BANNERS_QUERY',
  MENU_QUERY: 'MENU_QUERY',
}));

beforeEach(() => {
  mockStorefrontFetch.mockReset();
  vi.stubEnv('SHOPIFY_STORE_DOMAIN', 'glassyvision-o9b6utgq.myshopify.com');
});

function banner(entries: Array<{ key: string; value?: string | null; reference?: unknown }>) {
  return { node: { fields: entries.map((e) => ({ key: e.key, value: e.value ?? null, reference: e.reference ?? null })) } };
}

describe('getBanners', () => {
  it('groups active banners by slot, sorted by order, with cta + image mapped', async () => {
    mockStorefrontFetch.mockResolvedValueOnce({
      metaobjects: {
        edges: [
          banner([
            { key: 'slot', value: 'announcement' },
            { key: 'title', value: 'Free shipping over $75' },
            { key: 'cta_label', value: 'Shop now' },
            { key: 'cta_url', value: '/collections/all' },
            { key: 'active', value: 'true' },
            { key: 'order', value: '2' },
          ]),
          banner([
            { key: 'slot', value: 'announcement' },
            { key: 'title', value: 'Drop 02 live' },
            { key: 'active', value: 'true' },
            { key: 'order', value: '1' },
          ]),
          banner([
            { key: 'slot', value: 'plp_grid' },
            { key: 'title', value: 'Take the quiz' },
            { key: 'body', value: 'Find your frame in 60 seconds.' },
            { key: 'image', reference: { image: { url: 'https://cdn/x.png' } } },
            { key: 'active', value: 'true' },
            { key: 'order', value: '1' },
          ]),
        ],
      },
    });
    const { getBanners } = await import('@/lib/commerce/content');
    const b = await getBanners();

    expect(b.announcement).toHaveLength(2);
    expect(b.announcement[0].title).toBe('Drop 02 live'); // order 1 first
    expect(b.announcement[1].cta).toEqual({ href: '/shop/all', label: 'Shop now', external: false });
    expect(b.plp_grid[0]).toMatchObject({
      title: 'Take the quiz',
      body: 'Find your frame in 60 seconds.',
      imageUrl: 'https://cdn/x.png',
      cta: null,
    });
  });

  it('drops inactive, titleless, and unknown-slot banners', async () => {
    mockStorefrontFetch.mockResolvedValueOnce({
      metaobjects: {
        edges: [
          banner([{ key: 'slot', value: 'cart' }, { key: 'title', value: 'Off' }, { key: 'active', value: 'false' }]),
          banner([{ key: 'slot', value: 'cart' }, { key: 'active', value: 'true' }]), // no title
          banner([{ key: 'slot', value: 'sidebar' }, { key: 'title', value: 'X' }, { key: 'active', value: 'true' }]),
        ],
      },
    });
    const { getBanners } = await import('@/lib/commerce/content');
    expect(await getBanners()).toEqual({});
  });

  it('strips a dangerous cta_url but keeps the banner', async () => {
    mockStorefrontFetch.mockResolvedValueOnce({
      metaobjects: {
        edges: [
          banner([
            { key: 'slot', value: 'thanks' },
            { key: 'title', value: 'Join the club' },
            { key: 'cta_label', value: 'Click' },
            { key: 'cta_url', value: 'javascript:alert(1)' },
            { key: 'active', value: 'true' },
          ]),
        ],
      },
    });
    const { getBanners } = await import('@/lib/commerce/content');
    const b = await getBanners();
    expect(b.thanks[0].title).toBe('Join the club');
    expect(b.thanks[0].cta).toBeNull();
  });

  it('returns {} on fetch error (never throws)', async () => {
    mockStorefrontFetch.mockRejectedValueOnce(new Error('scope missing'));
    const { getBanners } = await import('@/lib/commerce/content');
    expect(await getBanners()).toEqual({});
  });
});
```

- [ ] **Step 2: RED** — `npx vitest run tests/lib/commerce/banners.test.ts` (fails: no `BANNERS_QUERY` export / `getBanners` missing).

- [ ] **Step 3: Append to `shopify-storefront.ts`:**

```ts
export const BANNERS_QUERY = `
  query Banners {
    metaobjects(type: "banner", first: 24) {
      edges {
        node {
          fields {
            key
            value
            reference {
              ... on MediaImage {
                image { url }
              }
            }
          }
        }
      }
    }
  }
`;
```

- [ ] **Step 4: Append to `src/lib/commerce/content.ts`** (extend the import line with `BANNERS_QUERY`; add `import { transformMenuUrl } from './menu';`):

```ts
export const BANNER_SLOTS = ['announcement', 'plp_grid', 'quiz_results', 'cart', 'pdp', 'thanks'] as const;

export interface SiteBanner {
  slot: string;
  title: string;
  body: string | null;
  cta: { href: string; label: string; external: boolean } | null;
  imageUrl: string | null;
}

interface BannersResponse {
  metaobjects: { edges: Array<{ node: { fields: FieldNode[] } }> };
}

function mapBanner(node: { fields: FieldNode[] }): (SiteBanner & { order: number }) | null {
  const f = fieldMap(node.fields);
  const slot = f.get('slot')?.value ?? '';
  const title = f.get('title')?.value ?? '';
  if (!(BANNER_SLOTS as readonly string[]).includes(slot)) return null;
  if (!title || f.get('active')?.value !== 'true') return null;

  // Merchant CTA URLs are untrusted: same transform + scheme allowlist as menus.
  let cta: SiteBanner['cta'] = null;
  const ctaLabel = f.get('cta_label')?.value;
  const ctaUrl = f.get('cta_url')?.value;
  if (ctaLabel && ctaUrl) {
    const t = transformMenuUrl(ctaUrl, process.env.SHOPIFY_STORE_DOMAIN ?? '');
    if (t) cta = { href: t.href, label: ctaLabel, external: t.external };
  }

  return {
    slot,
    title,
    body: f.get('body')?.value ?? null,
    cta,
    imageUrl: imageRefUrl(f.get('image')?.reference),
    order: Number(f.get('order')?.value ?? '0') || 0,
  };
}

/** Active banners grouped by slot, order-sorted. Error/empty -> {} (slots render nothing). */
export async function getBanners(): Promise<Record<string, SiteBanner[]>> {
  try {
    const data = await storefrontFetch<BannersResponse>(BANNERS_QUERY);
    const grouped: Record<string, (SiteBanner & { order: number })[]> = {};
    for (const edge of data.metaobjects.edges) {
      const b = mapBanner(edge.node);
      if (!b) continue;
      (grouped[b.slot] ??= []).push(b);
    }
    const out: Record<string, SiteBanner[]> = {};
    for (const [slot, list] of Object.entries(grouped)) {
      out[slot] = list.sort((a, b) => a.order - b.order).map(({ order: _order, ...rest }) => rest);
    }
    return out;
  } catch (err) {
    console.warn('Shopify banner metaobjects unavailable — banner slots render nothing', err);
    return {};
  }
}
```

- [ ] **Step 5: GREEN** — banners test file passes; full `npm test` green (485 + 4). NOTE: `tests/lib/commerce/content.test.ts` and `menu.test.ts` mock `shopify-storefront` — if they fail with "No export named BANNERS_QUERY", add `BANNERS_QUERY: ''` to those mock factories (only permitted change to them).

- [ ] **Step 6: Lint + commit**

```bash
npm run lint
git add src/lib/commerce/content.ts src/lib/commerce/shopify-storefront.ts tests/lib/commerce/banners.test.ts tests/lib/commerce/content.test.ts tests/lib/commerce/menu.test.ts
git commit -m "$(cat <<'EOF'
feat(banners): getBanners — slot-grouped merchant banners from Metaobjects

Active-only, order-sorted, unknown slots ignored; CTA URLs pass the menu
transform + scheme allowlist; error path returns {} so slots render nothing.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Banner components + announcement bar in layout

**Files:**
- Create: `src/components/site/AnnouncementBar.tsx`
- Create: `src/components/site/PromoBanner.tsx`
- Create: `src/features/shop/catalog/PromoTile.tsx`
- Modify: `src/features/shop/catalog/ProductGrid.tsx` (optional promo props)
- Modify: `src/app/(site)/layout.tsx` (fetch + render announcement)

**Interfaces:**
- Consumes: `SiteBanner`, `getBanners` (Task 1).
- Produces: `<AnnouncementBar banner={SiteBanner} />`, `<PromoBanner banner={SiteBanner} />`, `<PromoTile banner={SiteBanner} />`, `ProductGrid({ products, promo?, promoIndex? })`.

- [ ] **Step 1: `src/components/site/AnnouncementBar.tsx`**

```tsx
import Link from 'next/link';
import type { SiteBanner } from '@/lib/commerce/content';

export default function AnnouncementBar({ banner }: { banner: SiteBanner }) {
  const inner = (
    <p className="text-center text-[11px] font-mono font-bold uppercase tracking-widest py-2 px-4">
      {banner.title}
      {banner.cta && <span className="underline underline-offset-4 ml-2">{banner.cta.label}</span>}
    </p>
  );
  return (
    <div className="bg-ink text-white">
      {banner.cta ? (
        banner.cta.external ? (
          <a href={banner.cta.href} className="block hover:opacity-90 transition-opacity">{inner}</a>
        ) : (
          <Link href={banner.cta.href} className="block hover:opacity-90 transition-opacity">{inner}</Link>
        )
      ) : (
        inner
      )}
    </div>
  );
}
```

- [ ] **Step 2: `src/components/site/PromoBanner.tsx`**

```tsx
import Link from 'next/link';
import type { SiteBanner } from '@/lib/commerce/content';

/** Generic inline promo card used by the cart, PDP, thanks, and quiz-results slots. */
export default function PromoBanner({ banner }: { banner: SiteBanner }) {
  const cta = banner.cta;
  const ctaClasses =
    'inline-block mt-3 px-5 py-2.5 bg-accent text-white font-sans font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-accent-light transition-colors';
  return (
    <aside aria-label={banner.title} className="border border-line rounded-xl bg-white p-5">
      <p className="font-sans text-sm font-black uppercase tracking-wider text-ink">{banner.title}</p>
      {banner.body && <p className="text-sm text-muted font-serif italic mt-1 leading-relaxed">{banner.body}</p>}
      {cta &&
        (cta.external ? (
          <a href={cta.href} className={ctaClasses}>{cta.label}</a>
        ) : (
          <Link href={cta.href} className={ctaClasses}>{cta.label}</Link>
        ))}
    </aside>
  );
}
```

- [ ] **Step 3: `src/features/shop/catalog/PromoTile.tsx`**

```tsx
import Link from 'next/link';
import Image from 'next/image';
import type { SiteBanner } from '@/lib/commerce/content';

/** Product-card-shaped promo tile spliced into the PLP grid. */
export default function PromoTile({ banner }: { banner: SiteBanner }) {
  const body = (
    <div className="relative flex flex-col justify-end h-full aspect-square overflow-hidden rounded-xl border border-line bg-ink text-white">
      {banner.imageUrl && (
        <Image
          src={banner.imageUrl}
          alt=""
          aria-hidden="true"
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover opacity-60"
        />
      )}
      <div className="relative p-4">
        <p className="font-sans text-sm font-black uppercase tracking-wider">{banner.title}</p>
        {banner.body && <p className="text-xs font-serif italic mt-1 opacity-90">{banner.body}</p>}
        {banner.cta && (
          <p className="text-[11px] font-mono font-bold uppercase tracking-widest underline underline-offset-4 mt-2">
            {banner.cta.label}
          </p>
        )}
      </div>
    </div>
  );
  if (!banner.cta) return body;
  return banner.cta.external ? (
    <a href={banner.cta.href} className="block group">{body}</a>
  ) : (
    <Link href={banner.cta.href} className="block group">{body}</Link>
  );
}
```

- [ ] **Step 4: `ProductGrid.tsx`** — extend to splice the tile:

```tsx
import type { ShopifyProduct } from '@/lib/commerce/types';
import type { SiteBanner } from '@/lib/commerce/content';
import ProductCard from '@/features/shop/ProductCard';
import PromoTile from '@/features/shop/catalog/PromoTile';

interface ProductGridProps {
  products: ShopifyProduct[];
  /** Optional promo tile spliced into the grid (first page only — caller decides). */
  promo?: SiteBanner;
  promoIndex?: number;
}

export default function ProductGrid({ products, promo, promoIndex = 6 }: ProductGridProps) {
  const cards = products.map((p) => <ProductCard key={p.id} product={p} />);
  if (promo) {
    cards.splice(Math.min(promoIndex, cards.length), 0, <PromoTile key="promo-tile" banner={promo} />);
  }
  return <div className="grid grid-cols-2 md:grid-cols-3 gap-6 animate-fade-in-up">{cards}</div>;
}
```

- [ ] **Step 5: `(site)/layout.tsx`** — fetch both in parallel and render the bar between the skip-link and `SiteHeader`:

```tsx
import { getBanners } from '@/lib/commerce/content';
import AnnouncementBar from '@/components/site/AnnouncementBar';
// …
  const [navLinks, banners] = await Promise.all([getSiteNav(), getBanners()]);
  const announcement = banners.announcement?.[0];
// … in JSX, directly before <SiteHeader navLinks={navLinks} />:
      {announcement && <AnnouncementBar banner={announcement} />}
```

- [ ] **Step 6: Verify + commit** — `npm run lint && npx tsc --noEmit && npm test` green:

```bash
git add src/components/site/AnnouncementBar.tsx src/components/site/PromoBanner.tsx src/features/shop/catalog/PromoTile.tsx src/features/shop/catalog/ProductGrid.tsx "src/app/(site)/layout.tsx"
git commit -m "$(cat <<'EOF'
feat(banners): AnnouncementBar, PromoBanner, PromoTile + grid splice + layout wiring

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire PLP (grid tile, quiz banner, collection-image header), PDP, thanks

**Files:**
- Modify: `src/app/(site)/shop/[collection]/page.tsx`
- Modify: `src/app/(site)/p/[handle]/page.tsx`
- Modify: `src/app/thanks/[orderId]/page.tsx`

**Interfaces:** consumes `getBanners`, `PromoBanner`, `ProductGrid` promo props (Tasks 1–2).

- [ ] **Step 1: PLP** — in the page component (after `getPlpData`): `const banners = await getBanners();`, `const gridPromo = banners.plp_grid?.[0];`, `const quizBanner = sp.quiz === 'true' ? banners.quiz_results?.[0] : undefined;`. Render:
  - Collection image banner strip between `<Breadcrumbs …/>` and the `<h1>`:

```tsx
        {res.collection.image?.url && (
          <div className="relative h-40 sm:h-56 rounded-xl overflow-hidden border border-line">
            <Image src={res.collection.image.url} alt="" aria-hidden="true" fill sizes="100vw" className="object-cover" />
          </div>
        )}
```
    (add `import Image from 'next/image';`)
  - `{quizBanner && <PromoBanner banner={quizBanner} />}` as the first child of the `<main>` column (above `ActiveFilterPills`).
  - First grid becomes `<ProductGrid products={res.products} promo={gridPromo} />` (LoadMore's internal grids are untouched — no promo prop there).

- [ ] **Step 2: PDP** — make no other changes to data flow; after the existing configurator content inside the right column (`lg:col-span-5` div), append:

```tsx
          {pdpBanner && <PromoBanner banner={pdpBanner} />}
```
with `const pdpBanner = (await getBanners()).pdp?.[0];` computed in the component and the two imports added.

- [ ] **Step 3: thanks** — add imports (`getBanners`, `PromoBanner`); in the component: `const thanksBanner = (await getBanners()).thanks?.[0];`. Render between the tracking `<p className="text-sm text-muted-soft mb-8">…</p>` and the `<div className="pt-8 border-t border-line">` account block:

```tsx
        {thanksBanner && (
          <div className="text-left mb-8">
            <PromoBanner banner={thanksBanner} />
          </div>
        )}
```
(The page stays order-data-free — banners are global content; do not add any order-specific rendering.)

- [ ] **Step 4: Verify + commit** — lint/tsc/`npm test` green:

```bash
git add "src/app/(site)/shop/[collection]/page.tsx" "src/app/(site)/p/[handle]/page.tsx" "src/app/thanks/[orderId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(banners): wire PLP grid/quiz/header-image, PDP, and thanks slots

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Cart server-wrapper refactor + cart slot

**Files:**
- Create: `src/features/cart/CartClient.tsx` (the current cart page content, moved verbatim)
- Modify: `src/app/(site)/cart/page.tsx` (becomes a thin server wrapper)

**Interfaces:** `CartClient({ banner }: { banner: SiteBanner | null })`.

- [ ] **Step 1:** Move the ENTIRE current contents of `src/app/(site)/cart/page.tsx` into `src/features/cart/CartClient.tsx`, changing ONLY: component name `CartPage` → `CartClient`; add the `banner` prop (`{ banner }: { banner: SiteBanner | null }` + `import type { SiteBanner } from '@/lib/commerce/content'; import PromoBanner from '@/components/site/PromoBanner';`); and in the populated-cart return, render `{banner && <div className="mb-6"><PromoBanner banner={banner} /></div>}` directly above the line-items list. Every other line stays byte-identical (the `'use client'` directive moves with it).
- [ ] **Step 2:** New `src/app/(site)/cart/page.tsx`:

```tsx
import CartClient from '@/features/cart/CartClient';
import { getBanners } from '@/lib/commerce/content';

export const revalidate = 900;

export const metadata = { title: 'Cart' };

export default async function CartPage() {
  const banners = await getBanners();
  return <CartClient banner={banners.cart?.[0] ?? null} />;
}
```

- [ ] **Step 3: Verify** — lint/tsc/full `npm test` green; grep sanity: `grep -rn "use client" src/features/cart/CartClient.tsx` (directive present) and the page has none.
- [ ] **Step 4: Commit**

```bash
git add src/features/cart/CartClient.tsx "src/app/(site)/cart/page.tsx"
git commit -m "$(cat <<'EOF'
feat(banners): cart slot via server wrapper — client cart logic moved verbatim

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Verification sweep + visual pass + review

- [ ] `npm run lint && npx tsc --noEmit && npm test && npm run build` — all green (banner queries soft-fail on the missing scope, proving slot-empty fallback, like B/C did).
- [ ] Dev-server visual pass: home/shop/cart/PDP render with NO banners (unconfigured = nothing, byte-identical pages); no layout shift from the announcement slot.
- [ ] Record merchant checklist: define the `banner` metaobject type (fields per spec §3, Storefront access ON) + create entries per slot.
- [ ] Final branch review (fresh subagent, most capable model) → fixes → merge per finishing-a-development-branch.

## Self-review notes

- Spec §2 slot table ↔ Tasks 2–4 wiring one-for-one; §3 field keys match `mapBanner`; §4 cart refactor isolated in Task 4 with a verbatim-move gate; CTA safety reuses `transformMenuUrl` (tested incl. javascript: rejection). LoadMore pages intentionally promo-free (spec). Thanks page stays order-data-free.
