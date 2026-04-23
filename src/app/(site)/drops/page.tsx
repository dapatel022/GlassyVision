import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Drops',
  description: 'All GlassyVision drops — past, present, and upcoming.',
};

export default async function DropsListPage() {
  const supabase = createAdminClient();
  const { data: drops } = await supabase
    .from('drops')
    .select('id, slug, name, state, starts_at')
    .order('starts_at', { ascending: false });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink mb-10">Drops</h1>

      {drops && drops.length > 0 ? (
        <div className="space-y-6">
          {drops.map((d) => (
            <Link
              key={d.id}
              href={`/drops/${d.slug}`}
              className="block p-6 border border-line rounded-xl hover:border-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft">{d.state}</p>
                  <h2 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mt-1">{d.name}</h2>
                </div>
                {d.starts_at && (
                  <p className="text-sm text-muted font-mono">
                    {new Date(d.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="border border-dashed border-line rounded-xl p-16 text-center">
          <p className="font-serif italic text-muted">First drop launching soon.</p>
        </div>
      )}
    </div>
  );
}
