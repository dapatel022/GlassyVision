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
