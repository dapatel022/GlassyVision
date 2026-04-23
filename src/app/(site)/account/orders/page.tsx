import Link from 'next/link';

export const metadata = { title: 'Orders' };

export default function OrdersPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
      <h1 className="font-sans text-3xl font-black tracking-tight uppercase text-ink mb-8">Your orders</h1>
      <div className="border border-dashed border-line rounded-xl p-12 text-center">
        <p className="font-serif italic text-muted">
          Order history will appear here after Drop Nº 01.
        </p>
        <Link href="/shop" className="inline-block mt-4 text-accent underline">
          Browse frames →
        </Link>
      </div>
    </div>
  );
}
