# Dynamic Navigation (Shopify Menus) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `SiteHeader`'s hardcoded `NAV_LINKS` with links read live from the Shopify `main-menu` navigation menu, with a safe fallback to today's links.

**Architecture:** New pure/fetch module `src/lib/commerce/menu.ts` (URL transform + `getMenu` + `getSiteNav`); `MENU_QUERY` in `shopify-storefront.ts`; async `(site)/layout.tsx` passes `navLinks` prop to `SiteHeader`. Spec: `docs/superpowers/specs/2026-07-19-dynamic-nav-design.md`.

**Tech Stack:** Next.js 16 App Router, Storefront GraphQL `2025-01` via existing `storefrontFetch`, Vitest.

## Global Constraints

- All Shopify GraphQL stays inside `src/lib/commerce/`; version stays `2025-01`.
- Nav must NEVER disappear: any error/empty menu → `DEFAULT_NAV_LINKS` (Shop `/shop`, Frame Finder `/quiz`, Drops `/drops`, Story `/story`) — exact labels/hrefs of today's header.
- No mock-data fallback needed for menus (not money data); error path is `[]` + `console.warn`, never a throw that breaks the layout.
- `export const revalidate = 900` on `(site)/layout.tsx`.
- jsx-a11y enforced; `npm run lint` before every commit; commits via HEREDOC.
- Tests under `tests/lib/commerce/`; run one file with `npx vitest run <path>`; full suite `npm test` (baseline: 467 passing).
- Only files named per task may be touched.

---

### Task 1: `menu.ts` — transform + fetchers (TDD)

**Files:**
- Create: `src/lib/commerce/menu.ts`
- Modify: `src/lib/commerce/shopify-storefront.ts` (append `MENU_QUERY`)
- Test: `tests/lib/commerce/menu.test.ts`

**Interfaces:**
- Consumes: `storefrontFetch` from `./shopify-storefront`.
- Produces (used by Task 2): `NavLink { href: string; label: string; external?: boolean }`, `DEFAULT_NAV_LINKS: NavLink[]`, `transformMenuUrl(url: string, storeDomain: string): { href: string; external: boolean } | null`, `getMenu(handle?: string): Promise<NavLink[]>`, `getSiteNav(): Promise<NavLink[]>`.

- [ ] **Step 1: Write the failing tests** — create `tests/lib/commerce/menu.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorefrontFetch = vi.fn();
vi.mock('@/lib/commerce/shopify-storefront', () => ({
  storefrontFetch: mockStorefrontFetch,
  MENU_QUERY: 'MENU_QUERY',
}));

beforeEach(() => {
  mockStorefrontFetch.mockReset();
  vi.stubEnv('SHOPIFY_STORE_DOMAIN', 'glassyvision-o9b6utgq.myshopify.com');
});

describe('transformMenuUrl', () => {
  const DOMAIN = 'glassyvision-o9b6utgq.myshopify.com';

  it('maps store URLs onto app routes', async () => {
    const { transformMenuUrl } = await import('@/lib/commerce/menu');
    const t = (u: string) => transformMenuUrl(u, DOMAIN);
    expect(t(`https://${DOMAIN}/collections/sunglasses`)).toEqual({ href: '/shop/sunglasses', external: false });
    expect(t(`https://${DOMAIN}/collections/all`)).toEqual({ href: '/shop/all', external: false });
    expect(t(`https://${DOMAIN}/collections`)).toEqual({ href: '/shop', external: false });
    expect(t(`https://${DOMAIN}/products/halcyon-aviator`)).toEqual({ href: '/p/halcyon-aviator', external: false });
    expect(t(`https://${DOMAIN}/pages/story`)).toEqual({ href: '/story', external: false });
    expect(t(`https://${DOMAIN}/`)).toEqual({ href: '/', external: false });
    expect(t(`https://${DOMAIN}/quiz`)).toEqual({ href: '/quiz', external: false });
  });

  it('preserves query strings on same-store links', async () => {
    const { transformMenuUrl } = await import('@/lib/commerce/menu');
    expect(transformMenuUrl(`https://${DOMAIN}/collections/all?sort=newest`, DOMAIN)).toEqual({
      href: '/shop/all?sort=newest',
      external: false,
    });
  });

  it('passes relative URLs through the same mapping', async () => {
    const { transformMenuUrl } = await import('@/lib/commerce/menu');
    expect(transformMenuUrl('/collections/optical', DOMAIN)).toEqual({ href: '/shop/optical', external: false });
    expect(transformMenuUrl('/quiz', DOMAIN)).toEqual({ href: '/quiz', external: false });
  });

  it('keeps foreign hosts absolute and external', async () => {
    const { transformMenuUrl } = await import('@/lib/commerce/menu');
    expect(transformMenuUrl('https://instagram.com/glassyvision', DOMAIN)).toEqual({
      href: 'https://instagram.com/glassyvision',
      external: true,
    });
  });

  it('returns null for empty or unparsable input', async () => {
    const { transformMenuUrl } = await import('@/lib/commerce/menu');
    expect(transformMenuUrl('', DOMAIN)).toBeNull();
    expect(transformMenuUrl('not a url at all %%%', DOMAIN)).toBeNull();
  });
});

describe('getMenu', () => {
  it('maps menu items through the transform and drops null urls', async () => {
    mockStorefrontFetch.mockResolvedValueOnce({
      menu: {
        items: [
          { id: '1', title: 'Sunglasses', url: 'https://glassyvision-o9b6utgq.myshopify.com/collections/sunglasses' },
          { id: '2', title: 'Frame Finder', url: 'https://glassyvision-o9b6utgq.myshopify.com/quiz' },
          { id: '3', title: 'Broken', url: null },
          { id: '4', title: 'Instagram', url: 'https://instagram.com/gv' },
        ],
      },
    });
    const { getMenu } = await import('@/lib/commerce/menu');
    const links = await getMenu();
    expect(mockStorefrontFetch).toHaveBeenCalledWith('MENU_QUERY', { handle: 'main-menu' });
    expect(links).toEqual([
      { href: '/shop/sunglasses', label: 'Sunglasses', external: false },
      { href: '/quiz', label: 'Frame Finder', external: false },
      { href: 'https://instagram.com/gv', label: 'Instagram', external: true },
    ]);
  });

  it('returns [] when the menu is missing and on fetch error', async () => {
    const { getMenu } = await import('@/lib/commerce/menu');
    mockStorefrontFetch.mockResolvedValueOnce({ menu: null });
    expect(await getMenu()).toEqual([]);
    mockStorefrontFetch.mockRejectedValueOnce(new Error('scope missing'));
    expect(await getMenu()).toEqual([]);
  });
});

describe('getSiteNav', () => {
  it('returns menu links when present, DEFAULT_NAV_LINKS otherwise', async () => {
    const { getSiteNav, DEFAULT_NAV_LINKS } = await import('@/lib/commerce/menu');
    mockStorefrontFetch.mockResolvedValueOnce({
      menu: { items: [{ id: '1', title: 'Shop', url: '/collections/all' }] },
    });
    expect(await getSiteNav()).toEqual([{ href: '/shop/all', label: 'Shop', external: false }]);

    mockStorefrontFetch.mockRejectedValueOnce(new Error('boom'));
    expect(await getSiteNav()).toEqual(DEFAULT_NAV_LINKS);
    expect(DEFAULT_NAV_LINKS).toEqual([
      { href: '/shop', label: 'Shop' },
      { href: '/quiz', label: 'Frame Finder' },
      { href: '/drops', label: 'Drops' },
      { href: '/story', label: 'Story' },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify RED** — `npx vitest run tests/lib/commerce/menu.test.ts` → FAIL (module not found).

- [ ] **Step 3: Append `MENU_QUERY` to `src/lib/commerce/shopify-storefront.ts`:**

```ts
export const MENU_QUERY = `
  query Menu($handle: String!) {
    menu(handle: $handle) {
      items {
        id
        title
        url
      }
    }
  }
`;
```

- [ ] **Step 4: Implement `src/lib/commerce/menu.ts`:**

```ts
import { storefrontFetch, MENU_QUERY } from './shopify-storefront';

export interface NavLink {
  href: string;
  label: string;
  external?: boolean;
}

/** Today's hardcoded header links — the guaranteed fallback. */
export const DEFAULT_NAV_LINKS: NavLink[] = [
  { href: '/shop', label: 'Shop' },
  { href: '/quiz', label: 'Frame Finder' },
  { href: '/drops', label: 'Drops' },
  { href: '/story', label: 'Story' },
];

// Shopify menu-item paths -> app routes.
function mapPath(pathname: string): string {
  if (pathname === '/collections' || pathname === '/collections/') return '/shop';
  const collection = pathname.match(/^\/collections\/([^/]+)\/?$/);
  if (collection) return `/shop/${collection[1]}`;
  const product = pathname.match(/^\/products\/([^/]+)\/?$/);
  if (product) return `/p/${product[1]}`;
  const page = pathname.match(/^\/pages\/([^/]+)\/?$/);
  if (page) return `/${page[1]}`;
  return pathname;
}

/**
 * Turn a Shopify menu item URL into an app link. Same-store URLs become
 * relative app routes; foreign hosts stay absolute (external). Unparsable
 * input -> null (caller drops the item).
 */
export function transformMenuUrl(
  url: string,
  storeDomain: string,
): { href: string; external: boolean } | null {
  if (!url) return null;

  if (url.startsWith('/')) {
    const [path, search = ''] = url.split('?');
    return { href: mapPath(path) + (search ? `?${search}` : ''), external: false };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.host !== storeDomain) {
    return { href: url, external: true };
  }
  return { href: mapPath(parsed.pathname) + parsed.search, external: false };
}

interface MenuResponse {
  menu: { items: Array<{ id: string; title: string; url: string | null }> } | null;
}

/** Fetch a Shopify navigation menu. Error or missing menu -> [] (nav is not money data — no mock fallback; the caller's default covers it). */
export async function getMenu(handle = 'main-menu'): Promise<NavLink[]> {
  try {
    const data = await storefrontFetch<MenuResponse>(MENU_QUERY, { handle });
    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN ?? '';
    return (data.menu?.items ?? []).flatMap((item) => {
      const t = item.url ? transformMenuUrl(item.url, storeDomain) : null;
      return t ? [{ href: t.href, label: item.title, external: t.external }] : [];
    });
  } catch (err) {
    console.warn('Shopify getMenu failed — header will use default links', err);
    return [];
  }
}

/** The header's nav: the merchant's main-menu, or the built-in defaults. */
export async function getSiteNav(): Promise<NavLink[]> {
  const links = await getMenu();
  return links.length > 0 ? links : DEFAULT_NAV_LINKS;
}
```

- [ ] **Step 5: Run to verify GREEN** — `npx vitest run tests/lib/commerce/menu.test.ts` → PASS. Then full `npm test` (baseline 467 + new = all green).

- [ ] **Step 6: Lint + commit**

```bash
npm run lint
git add src/lib/commerce/menu.ts src/lib/commerce/shopify-storefront.ts tests/lib/commerce/menu.test.ts
git commit -m "$(cat <<'EOF'
feat(nav): menu module — Shopify main-menu fetch + URL transform + default fallback

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Wire layout + prop-driven `SiteHeader`

**Files:**
- Modify: `src/app/(site)/layout.tsx`
- Modify: `src/components/site/SiteHeader.tsx`

**Interfaces:**
- Consumes: `getSiteNav`, `NavLink` from Task 1.
- Produces: `SiteHeader({ navLinks }: { navLinks: NavLink[] })` — prop now required.

- [ ] **Step 1: Rewrite `src/app/(site)/layout.tsx`:**

```tsx
import SiteHeader from '@/components/site/SiteHeader';
import SiteFooter from '@/components/site/SiteFooter';
import { getSiteNav } from '@/lib/commerce/menu';

// Refresh the merchant-managed menu on the same cadence as the catalog.
export const revalidate = 900;

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const navLinks = await getSiteNav();

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>
      <SiteHeader navLinks={navLinks} />
      {/* tabIndex={-1} lets the skip link move focus (not just scroll) in Chromium/Safari */}
      <main id="main-content" tabIndex={-1} className="min-h-[calc(100vh-4rem)] focus:outline-none">{children}</main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2: Update `src/components/site/SiteHeader.tsx`** — delete the `NAV_LINKS` const; change the signature and both render loops:

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '@/context/CartContext';
import type { NavLink } from '@/lib/commerce/menu';

interface SiteHeaderProps {
  navLinks: NavLink[];
}

function NavItem({ link, className, onClick }: { link: NavLink; className: string; onClick?: () => void }) {
  if (link.external) {
    return (
      <a href={link.href} className={className} onClick={onClick}>
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className} onClick={onClick}>
      {link.label}
    </Link>
  );
}

export default function SiteHeader({ navLinks }: SiteHeaderProps) {
  const { count, hydrated } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);
  ...
```

Desktop nav loop becomes:

```tsx
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((l) => (
            <NavItem
              key={l.href}
              link={l}
              className="font-sans text-xs font-bold uppercase tracking-wider text-ink hover:text-accent transition-colors"
            />
          ))}
        </nav>
```

Mobile menu loop becomes:

```tsx
            {navLinks.map((l) => (
              <NavItem
                key={l.href}
                link={l}
                onClick={() => setMobileOpen(false)}
                className="font-sans text-xs font-bold uppercase tracking-wider text-ink py-2"
              />
            ))}
```

Everything else in the file (logo, Account, Cart badge, mobile toggle button, markup/classes) stays byte-identical.

- [ ] **Step 3: Verify** — `npm run lint && npx tsc --noEmit && npm test` → all green (importing the `NavLink` type into a client component is type-only — erased at compile time, no server code bundled).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(site)/layout.tsx" src/components/site/SiteHeader.tsx
git commit -m "$(cat <<'EOF'
feat(nav): header links come from the Shopify main-menu (prop-driven SiteHeader)

Layout fetches getSiteNav() (menu or default fallback) and passes navLinks;
external items render plain anchors. revalidate=900 keeps the menu fresh.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Verification sweep + visual pass + review

- [ ] **Step 1:** `npm run lint && npx tsc --noEmit && npm test && npm run build` — all green.
- [ ] **Step 2:** Start the dev server, load `/` and `/shop` — header must show the four default links (fallback mode: the `unauthenticated_read_content` scope isn't granted yet, so the menu query fails softly). Confirm mobile menu still opens/closes.
- [ ] **Step 3:** Merchant checklist to record for the founder: grant `unauthenticated_read_content` on the app's Storefront API config; curate Content → Menus → Main menu. When granted, verify header switches to menu-driven links.
- [ ] **Step 4:** Final branch review (fresh subagent) → address findings → merge per finishing-a-development-branch.

## Self-review notes

- Spec §2 architecture ↔ Tasks 1–2 file-for-file; fallback guarantee tested (`getSiteNav` error path); URL mapping matrix covered by tests incl. query-string preservation and foreign-host external. Type-only import into the client component avoids bundling server fetch code. No task touches money/Rx/lab/Supabase files.
