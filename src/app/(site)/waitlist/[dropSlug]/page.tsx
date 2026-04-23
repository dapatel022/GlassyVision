import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import WaitlistForm from '@/features/shop/WaitlistForm';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ dropSlug: string }>;
}

export default async function WaitlistPage({ params }: PageProps) {
  const { dropSlug } = await params;
  const supabase = createAdminClient();

  const { data: drop } = await supabase
    .from('drops')
    .select('slug, name, starts_at, hero_copy')
    .eq('slug', dropSlug)
    .maybeSingle();

  if (!drop) notFound();

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-20 text-center">
      <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">Waitlist</p>
      <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink mb-4">{drop.name}</h1>
      {drop.starts_at && (
        <p className="text-sm text-muted font-mono mb-6">
          Launches {new Date(drop.starts_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      )}
      {drop.hero_copy && (
        <p className="text-muted font-serif italic mb-8 leading-relaxed">{drop.hero_copy}</p>
      )}
      <WaitlistForm dropSlug={drop.slug} />
      <p className="text-xs text-muted-soft mt-6">
        We&apos;ll email you 24 hours before the drop goes live.
      </p>
    </div>
  );
}
