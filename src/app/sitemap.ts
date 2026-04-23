import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://glassyvision.com';

const STATIC_ROUTES = [
  '/',
  '/shop',
  '/drops',
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

export default function sitemap(): MetadataRoute.Sitemap {
  return STATIC_ROUTES.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1.0 : 0.7,
  }));
}
