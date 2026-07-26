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
