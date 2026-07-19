import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildQuizShopUrl } from '@/lib/commerce/catalog-filters';

describe('quiz -> catalog integration', () => {
  it('quiz page delegates to buildQuizShopUrl (no legacy /shop?shape= push left behind)', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/(site)/quiz/page.tsx'), 'utf8');
    expect(src).toContain('buildQuizShopUrl');
    expect(src).not.toContain('/shop?shape=');
  });

  it('every face shape produces a valid /shop/all URL', () => {
    for (const shape of ['oval', 'square', 'heart', 'diamond', 'round']) {
      const url = buildQuizShopUrl({ shape, size: 'm', intent: 'rx_clear' });
      expect(url.startsWith('/shop/all?')).toBe(true);
      expect(url).toContain('quiz=true');
    }
  });
});
