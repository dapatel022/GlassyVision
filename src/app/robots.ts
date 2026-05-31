import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://glassyvision.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Keep operational + customer-private surfaces out of search indexes.
      disallow: ['/admin', '/lab', '/api', '/rx', '/account', '/thanks', '/track', '/checkout'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
