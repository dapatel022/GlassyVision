import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ orderId: string }>;
}

// Reached by the post-checkout redirect, keyed on a guessable order number and
// with no token to bind it to the buyer. It therefore shows NO order-specific
// data: no email, and it never mints an Rx-upload token (doing either turned the
// page into a PII + prescription-access oracle — see 2026-06-12 audit C3). The
// secure Rx-upload and tracking links are delivered by email to the customer.
export default async function ThanksPage({ params }: PageProps) {
  const { orderId } = await params;

  return (
    <div className="min-h-screen bg-base flex items-center justify-center px-4">
      <div className="max-w-lg text-center">
        <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">
          Order {orderId}
        </p>
        <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink mb-3">
          Thank you!
        </h1>
        <p className="text-muted font-serif italic mb-6 leading-relaxed">
          We&apos;ve emailed your order confirmation. If your order includes prescription
          lenses, that email also has a secure link to upload your prescription — it only
          takes a minute, and your glasses ship once we have a valid prescription on file.
        </p>
        <p className="text-sm text-muted-soft mb-8">
          You can track your order any time from your account or the link in your shipping email.
        </p>

        <div className="pt-8 border-t border-line">
          <p className="text-muted font-serif italic mb-4 leading-relaxed">
            Create an account to track orders, manage your subscription, and reuse your prescription.
          </p>
          <Link
            href="/account/login"
            className="inline-block py-3 px-6 bg-ink text-base font-sans font-bold text-xs tracking-widest uppercase"
          >
            Create your account
          </Link>
        </div>
      </div>
    </div>
  );
}
