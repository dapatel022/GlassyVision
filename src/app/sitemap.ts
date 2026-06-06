import type { MetadataRoute } from 'next';
import { getProducts } from '@/lib/commerce/shopify';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://glassyvision.com';

const STATIC_ROUTES = [
  '/',
  '/shop',
  '/drops',
  '/quiz',
  '/story',
  '/made-in-india',
  '/lookbook',
  '/faq',
  '/contact',
  '/returns',
  '/privacy',
  '/terms',
  '/rx-disclaimer',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1.0 : 0.7,
  }));

  // Product detail pages — the most commercial URLs. Best-effort: if the
  // catalog can't be fetched at build time, fall back to static routes only.
  let productEntries: MetadataRoute.Sitemap = [];
  try {
    const products = await getProducts();
    productEntries = products.map((p) => ({
      url: `${BASE_URL}/p/${p.handle}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));
  } catch (e) {
    console.warn('[sitemap] Shopify product fetch failed, omitting product URLs:', e);
    productEntries = [];
  }

  return [...staticEntries, ...productEntries];
}
