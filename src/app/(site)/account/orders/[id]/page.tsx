import Link from 'next/link';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
      <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">Order {id}</p>
      <h1 className="font-sans text-3xl font-black tracking-tight uppercase text-ink mb-8">Order detail</h1>
      <div className="border border-dashed border-line rounded-xl p-12 text-center">
        <p className="font-serif italic text-muted">
          Order detail view ships with Drop Nº 01.
        </p>
        <Link href={`/track/${id}`} className="inline-block mt-4 text-accent underline">
          Track this order →
        </Link>
      </div>
    </div>
  );
}
