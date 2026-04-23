import Link from 'next/link';

export const metadata = { title: 'Account' };

export default function AccountPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
      <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">Account</p>
      <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink mb-8">
        Your account
      </h1>

      <div className="p-6 border border-dashed border-line rounded-xl text-center">
        <p className="font-serif italic text-muted mb-4">
          Account dashboard is coming with Drop Nº 01.
        </p>
        <p className="text-sm text-muted-soft mb-6">
          Track orders, download receipts, start returns, save addresses.
        </p>
        <Link
          href="/track/example"
          className="inline-block px-4 py-2 border border-line rounded-lg text-sm font-sans font-bold uppercase tracking-wider text-ink hover:bg-base-deeper"
        >
          Track an order with your link
        </Link>
      </div>
    </div>
  );
}
