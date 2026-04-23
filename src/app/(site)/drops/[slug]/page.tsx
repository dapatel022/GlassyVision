import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import WaitlistForm from '@/features/shop/WaitlistForm';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function DropDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: drop } = await supabase
    .from('drops')
    .select('id, slug, name, state, starts_at, hero_headline, hero_copy')
    .eq('slug', slug)
    .maybeSingle();

  if (!drop) notFound();

  const isUpcoming = drop.state === 'draft' || drop.state === 'scheduled';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">
        {drop.state}
      </p>
      <h1 className="font-sans text-5xl font-black tracking-tight uppercase text-ink mb-6">
        {drop.hero_headline || drop.name}
      </h1>
      {drop.hero_copy && (
        <p className="text-lg text-muted font-serif leading-relaxed mb-8 whitespace-pre-line">
          {drop.hero_copy}
        </p>
      )}

      {isUpcoming ? (
        <div>
          <h2 className="font-sans text-xl font-bold text-ink mb-4">Join the waitlist</h2>
          <WaitlistForm dropSlug={drop.slug} />
        </div>
      ) : (
        <Link
          href="/shop"
          className="inline-block px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light"
        >
          Shop the drop
        </Link>
      )}
    </div>
  );
}
