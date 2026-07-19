# Editable Homepage Content (Shopify Metaobjects) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The homepage hero slides, floating badge, and ticker phrases become merchant-editable Shopify Metaobjects, with a hard fallback to today's hardcoded content.

**Architecture:** New `src/lib/commerce/content.ts` (`getHomepageContent()`); `HERO_SLIDES_QUERY` + `HOMEPAGE_QUERY` in `shopify-storefront.ts`; home `page.tsx` passes props; `HeroShowcase` takes optional `slides`/`badgeText`. Spec: `docs/superpowers/specs/2026-07-19-editable-homepage-design.md`.

**Tech Stack:** Next.js 16 App Router, Storefront GraphQL `2025-01`, Vitest.

## Global Constraints

- All Shopify GraphQL in `src/lib/commerce/`; version `2025-01`.
- **No hardcoded prices in content:** slide price/title/handle/default image come from the referenced Shopify product, never from typed metaobject fields.
- Homepage must NEVER go blank: any error/empty → `null` fields + `console.warn`, components fall back to the current hardcoded hero/ticker/badge byte-for-byte.
- Metaobject **list** fields (e.g. `ticker_phrases`) serialize `value` as a JSON-encoded array string — parse defensively (`JSON.parse` in try/catch; non-array → null).
- jsx-a11y enforced; lint before every commit; commits via HEREDOC; tests under `tests/lib/commerce/`; baseline 478 tests stay green.
- Only files named per task.

---

### Task 1: `content.ts` — homepage content fetchers (TDD)

**Files:**
- Create: `src/lib/commerce/content.ts`
- Modify: `src/lib/commerce/shopify-storefront.ts` (append two queries)
- Test: `tests/lib/commerce/content.test.ts`

**Interfaces:**
- Consumes: `storefrontFetch`.
- Produces (Task 2 relies on these exact names): `HeroSlide { handle: string; title: string; price: string; colorName: string; colorHex: string; imageUrl: string; description: string; tag: string }`, `HomepageContent { slides: HeroSlide[] | null; tickerPhrases: string[] | null; badgeText: string | null }`, `getHomepageContent(): Promise<HomepageContent>`.

- [ ] **Step 1: Write the failing tests** — `tests/lib/commerce/content.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorefrontFetch = vi.fn();
vi.mock('@/lib/commerce/shopify-storefront', () => ({
  storefrontFetch: mockStorefrontFetch,
  HERO_SLIDES_QUERY: 'HERO_SLIDES_QUERY',
  HOMEPAGE_QUERY: 'HOMEPAGE_QUERY',
}));

beforeEach(() => mockStorefrontFetch.mockReset());

const PRODUCT_REF = {
  handle: 'halcyon-aviator',
  title: 'Halcyon Aviator',
  description: 'Product description text.',
  priceRange: { minVariantPrice: { amount: '95.00' } },
  featuredImage: { url: 'https://cdn/product.png' },
};

function slideNode(overrides: Record<string, unknown> = {}) {
  return {
    fields: [
      { key: 'product', value: null, reference: PRODUCT_REF },
      { key: 'tag', value: 'Drop N° 02 · New', reference: null },
      { key: 'description', value: 'Editorial copy.', reference: null },
      { key: 'color_name', value: 'Storm Grey', reference: null },
      { key: 'color_hex', value: '#5b626b', reference: null },
      { key: 'image', value: null, reference: { image: { url: 'https://cdn/override.png' } } },
      { key: 'order', value: '2', reference: null },
      ...Object.entries(overrides).map(([key, v]) => v as { key: string; value: string | null; reference: unknown }),
    ].filter((f, i, arr) => arr.findIndex((x) => x.key === f.key) === i || !(f.key in overrides)),
  };
}

// simpler explicit builders used below instead of the generic helper:
function fields(entries: Array<{ key: string; value?: string | null; reference?: unknown }>) {
  return { fields: entries.map((e) => ({ key: e.key, value: e.value ?? null, reference: e.reference ?? null })) };
}

describe('getHomepageContent — hero slides', () => {
  it('maps a full slide: product-sourced title/handle/price, overrides applied, sorted by order', async () => {
    mockStorefrontFetch
      .mockResolvedValueOnce({
        metaobjects: {
          edges: [
            {
              node: fields([
                { key: 'product', reference: PRODUCT_REF },
                { key: 'tag', value: 'Second' },
                { key: 'color_name', value: 'B' },
                { key: 'color_hex', value: '#222222' },
                { key: 'order', value: '2' },
              ]),
            },
            {
              node: fields([
                { key: 'product', reference: { ...PRODUCT_REF, handle: 'meridian-round', title: 'Meridian Round' } },
                { key: 'tag', value: 'First' },
                { key: 'description', value: 'Editorial copy.' },
                { key: 'color_name', value: 'A' },
                { key: 'color_hex', value: '#111111' },
                { key: 'image', reference: { image: { url: 'https://cdn/override.png' } } },
                { key: 'order', value: '1' },
              ]),
            },
          ],
        },
      })
      .mockResolvedValueOnce({ metaobject: null });

    const { getHomepageContent } = await import('@/lib/commerce/content');
    const c = await getHomepageContent();

    expect(c.slides).toHaveLength(2);
    // sorted by order: 'First' slide first
    expect(c.slides![0]).toEqual({
      handle: 'meridian-round',
      title: 'Meridian Round',
      price: '95',
      colorName: 'A',
      colorHex: '#111111',
      imageUrl: 'https://cdn/override.png', // image override wins
      description: 'Editorial copy.',
      tag: 'First',
    });
    // no description field -> product description; no image override -> featuredImage
    expect(c.slides![1].description).toBe('Product description text.');
    expect(c.slides![1].imageUrl).toBe('https://cdn/product.png');
    expect(c.slides![1].price).toBe('95');
  });

  it('drops slides without a resolvable product and returns null when none survive', async () => {
    mockStorefrontFetch
      .mockResolvedValueOnce({
        metaobjects: { edges: [{ node: fields([{ key: 'tag', value: 'Orphan' }]) }] },
      })
      .mockResolvedValueOnce({ metaobject: null });
    const { getHomepageContent } = await import('@/lib/commerce/content');
    const c = await getHomepageContent();
    expect(c.slides).toBeNull();
  });
});

describe('getHomepageContent — homepage singleton', () => {
  it('parses ticker list (JSON-encoded value) and badge text', async () => {
    mockStorefrontFetch
      .mockResolvedValueOnce({ metaobjects: { edges: [] } })
      .mockResolvedValueOnce({
        metaobject: fields([
          { key: 'ticker_phrases', value: '["Phrase one","Phrase two"]' },
          { key: 'badge_text', value: 'Drop N° 02 · Hand-Finished' },
        ]),
      });
    const { getHomepageContent } = await import('@/lib/commerce/content');
    const c = await getHomepageContent();
    expect(c.tickerPhrases).toEqual(['Phrase one', 'Phrase two']);
    expect(c.badgeText).toBe('Drop N° 02 · Hand-Finished');
    expect(c.slides).toBeNull();
  });

  it('malformed ticker JSON -> null tickerPhrases (never throws)', async () => {
    mockStorefrontFetch
      .mockResolvedValueOnce({ metaobjects: { edges: [] } })
      .mockResolvedValueOnce({ metaobject: fields([{ key: 'ticker_phrases', value: 'not json' }]) });
    const { getHomepageContent } = await import('@/lib/commerce/content');
    const c = await getHomepageContent();
    expect(c.tickerPhrases).toBeNull();
  });
});

describe('getHomepageContent — failure isolation', () => {
  it('returns all-null on total fetch failure, and per-part null on partial failure', async () => {
    const { getHomepageContent } = await import('@/lib/commerce/content');

    mockStorefrontFetch.mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce(new Error('boom'));
    expect(await getHomepageContent()).toEqual({ slides: null, tickerPhrases: null, badgeText: null });

    // slides fail, singleton succeeds
    mockStorefrontFetch
      .mockRejectedValueOnce(new Error('scope'))
      .mockResolvedValueOnce({ metaobject: fields([{ key: 'badge_text', value: 'Still here' }]) });
    const c = await getHomepageContent();
    expect(c.slides).toBeNull();
    expect(c.badgeText).toBe('Still here');
  });
});
```

Note: delete the unused `slideNode` helper if the final test file doesn't use it — the explicit `fields()` builder is the one the tests rely on. The test file as committed must be lint-clean (no unused symbols).

- [ ] **Step 2: RED** — `npx vitest run tests/lib/commerce/content.test.ts` → module not found.

- [ ] **Step 3: Append queries to `src/lib/commerce/shopify-storefront.ts`:**

```ts
export const HERO_SLIDES_QUERY = `
  query HeroSlides {
    metaobjects(type: "hero_slide", first: 12) {
      edges {
        node {
          fields {
            key
            value
            reference {
              ... on Product {
                handle
                title
                description
                priceRange { minVariantPrice { amount } }
                featuredImage { url }
              }
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

export const HOMEPAGE_QUERY = `
  query Homepage {
    metaobject(handle: { type: "homepage", handle: "main" }) {
      fields {
        key
        value
      }
    }
  }
`;
```

- [ ] **Step 4: Implement `src/lib/commerce/content.ts`:**

```ts
import { storefrontFetch, HERO_SLIDES_QUERY, HOMEPAGE_QUERY } from './shopify-storefront';

export interface HeroSlide {
  handle: string;
  title: string;
  price: string;
  colorName: string;
  colorHex: string;
  imageUrl: string;
  description: string;
  tag: string;
}

export interface HomepageContent {
  slides: HeroSlide[] | null;
  tickerPhrases: string[] | null;
  badgeText: string | null;
}

interface ProductRef {
  handle: string;
  title: string;
  description: string;
  priceRange: { minVariantPrice: { amount: string } };
  featuredImage: { url: string } | null;
}

interface FieldNode {
  key: string;
  value: string | null;
  reference?: unknown;
}

interface HeroSlidesResponse {
  metaobjects: { edges: Array<{ node: { fields: FieldNode[] } }> };
}

interface HomepageResponse {
  metaobject: { fields: FieldNode[] } | null;
}

function fieldMap(fieldsArr: FieldNode[]): Map<string, FieldNode> {
  return new Map(fieldsArr.map((f) => [f.key, f]));
}

function isProductRef(ref: unknown): ref is ProductRef {
  return !!ref && typeof ref === 'object' && 'handle' in ref && 'priceRange' in ref;
}

function imageRefUrl(ref: unknown): string | null {
  const img = (ref as { image?: { url?: string } } | null)?.image?.url;
  return typeof img === 'string' ? img : null;
}

function mapSlide(node: { fields: FieldNode[] }): (HeroSlide & { order: number }) | null {
  const f = fieldMap(node.fields);
  const product = f.get('product')?.reference;
  if (!isProductRef(product)) return null; // slide without a product is unusable

  const override = imageRefUrl(f.get('image')?.reference);
  const imageUrl = override ?? product.featuredImage?.url ?? '';
  if (!imageUrl) return null; // hero requires an image

  return {
    handle: product.handle,
    title: product.title,
    price: Number(product.priceRange.minVariantPrice.amount).toFixed(0),
    colorName: f.get('color_name')?.value ?? '',
    colorHex: f.get('color_hex')?.value ?? '#d4d4d8',
    imageUrl,
    description: f.get('description')?.value || product.description,
    tag: f.get('tag')?.value ?? '',
    order: Number(f.get('order')?.value ?? '0') || 0,
  };
}

function parsePhrases(value: string | null | undefined): string[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const phrases = parsed.filter((p): p is string => typeof p === 'string' && p.length > 0);
    return phrases.length > 0 ? phrases : null;
  } catch {
    return null;
  }
}

/**
 * Merchant-editable homepage content from Shopify Metaobjects. Every part
 * degrades independently to null (callers fall back to built-in content) —
 * the homepage can never go blank because of a content failure.
 */
export async function getHomepageContent(): Promise<HomepageContent> {
  let slides: HeroSlide[] | null = null;
  let tickerPhrases: string[] | null = null;
  let badgeText: string | null = null;

  try {
    const data = await storefrontFetch<HeroSlidesResponse>(HERO_SLIDES_QUERY);
    const mapped = data.metaobjects.edges
      .map((e) => mapSlide(e.node))
      .filter((s): s is HeroSlide & { order: number } => s !== null)
      .sort((a, b) => a.order - b.order)
      .map(({ order: _order, ...slide }) => slide);
    slides = mapped.length > 0 ? mapped : null;
  } catch (err) {
    console.warn('Shopify hero_slide metaobjects unavailable — using built-in hero', err);
  }

  try {
    const data = await storefrontFetch<HomepageResponse>(HOMEPAGE_QUERY);
    if (data.metaobject) {
      const f = fieldMap(data.metaobject.fields);
      tickerPhrases = parsePhrases(f.get('ticker_phrases')?.value);
      badgeText = f.get('badge_text')?.value ?? null;
    }
  } catch (err) {
    console.warn('Shopify homepage metaobject unavailable — using built-in ticker/badge', err);
  }

  return { slides, tickerPhrases, badgeText };
}
```

- [ ] **Step 5: GREEN** — `npx vitest run tests/lib/commerce/content.test.ts` → PASS; then full `npm test` (478 + new all green).

- [ ] **Step 6: Lint + commit**

```bash
npm run lint
git add src/lib/commerce/content.ts src/lib/commerce/shopify-storefront.ts tests/lib/commerce/content.test.ts
git commit -m "$(cat <<'EOF'
feat(content): homepage hero/ticker/badge from Shopify Metaobjects

Slides reference real products (live price/title/image — no typed prices);
editorial overrides for tag/description/color/image; ticker + badge from a
homepage singleton. Every part degrades to null independently.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Wire home page + `HeroShowcase` props

**Files:**
- Modify: `src/app/(site)/page.tsx`
- Modify: `src/features/shop/HeroShowcase.tsx`

**Interfaces:**
- Consumes: `getHomepageContent`, `HeroSlide` (Task 1).
- Produces: `HeroShowcase({ slides?: HeroSlide[]; badgeText?: string })`.

- [ ] **Step 1: `src/app/(site)/page.tsx` edits:**

1. Add imports: `import { getHomepageContent } from '@/lib/commerce/content';`
2. In `HomePage()`, after the existing `products` fetch, add:

```ts
  const content = await getHomepageContent();

  const tickerPhrases = content.tickerPhrases ?? [
    'Designed in Syracuse · Hand-finished in India',
    'Cellulose Acetate & Pure Titanium',
    'Small-Batch Limited Runs Only',
    'Prescription Ready Optics',
  ];
```

3. Change the hero render to `<HeroShowcase slides={content.slides ?? undefined} badgeText={content.badgeText ?? undefined} />`.
4. Replace the two hardcoded ticker span runs (the visible run AND the `{/* duplicate for infinite illusion */}` run) with two identical maps:

```tsx
          {[0, 1].map((run) => (
            <span key={run} className="inline-flex">
              {tickerPhrases.map((phrase, i) => (
                <span key={`${run}-${i}`} className="inline-flex items-center">
                  <span className="mx-8">{phrase}</span>
                  <span className="mx-8 text-accent" aria-hidden="true">•</span>
                </span>
              ))}
            </span>
          ))}
```

(Preserve the surrounding ticker wrapper div/classes exactly; only the span runs inside change.)

- [ ] **Step 2: `src/features/shop/HeroShowcase.tsx` edits:**

1. Add `import type { HeroSlide } from '@/lib/commerce/content';`
2. Delete the `id` property from the `ShowcaseItem` interface and from all four `SHOWCASE_ITEMS` entries, making `ShowcaseItem` structurally identical to `HeroSlide` (same 8 fields). Then type the array as `const SHOWCASE_ITEMS: HeroSlide[] = [...]` and delete the now-redundant local `ShowcaseItem` interface.
3. Change the signature and item source:

```tsx
interface HeroShowcaseProps {
  slides?: HeroSlide[];
  badgeText?: string;
}

export default function HeroShowcase({ slides, badgeText }: HeroShowcaseProps) {
  const items = slides && slides.length > 0 ? slides : SHOWCASE_ITEMS;
  const [activeIdx, setActiveIdx] = useState(0);
  const activeItem = items[activeIdx];
```

4. Replace every remaining `SHOWCASE_ITEMS` reference in the JSX with `items`; change the swatch `key={item.id}` to `key={item.handle}`.
5. Guard `activeIdx` against a shorter dynamic array: in `handleSelect` nothing changes, but derive safely: `const activeItem = items[Math.min(activeIdx, items.length - 1)];`
6. Floating badge text becomes `{badgeText ?? 'Drop N° 01 · Hand-Finished'}`.
7. Everything else (animation, layout, classes, CTAs) stays byte-identical. Note the two CTAs already use `activeItem.handle` → `/p/<handle>` — works unchanged for dynamic slides.

- [ ] **Step 3: Verify** — `npm run lint && npx tsc --noEmit && npm test` all green.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(site)/page.tsx" src/features/shop/HeroShowcase.tsx
git commit -m "$(cat <<'EOF'
feat(content): homepage renders metaobject-driven hero/ticker/badge with fallback

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Verification sweep + visual pass + review

- [ ] **Step 1:** `npm run lint && npx tsc --noEmit && npm test && npm run build` — all green (expect soft warns for the missing metaobjects scope, proving the fallback, same as the menu build did).
- [ ] **Step 2:** Dev-server visual pass on `/`: hero renders the built-in showcase (fallback mode), ticker scrolls the four default phrases, badge intact; style-selector swatches still switch slides.
- [ ] **Step 3:** Record the merchant checklist: grant `unauthenticated_read_metaobjects`; define `hero_slide` + `homepage` metaobject types (field keys per spec §2, Storefront access ON); create entries.
- [ ] **Step 4:** Final branch review (fresh subagent) → fixes → merge per finishing-a-development-branch.

## Self-review notes

- No-hardcoded-prices honored: price always derives from the product reference (`priceRange.minVariantPrice`), formatted `toFixed(0)` to match the current display. Fallback path preserved byte-identical (SHOWCASE_ITEMS keep their `/demo` images). Partial-failure isolation is explicit (two independent try/catches) and tested. `order:_order` destructure strips the sort key from the public shape. Task 2's `items.length` guard prevents index-out-of-range when merchant publishes fewer slides than the previously-selected index — reviewer should confirm.
