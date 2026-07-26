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
