export const metadata = { title: 'FAQ' };

const FAQ = [
  {
    q: 'Where do you ship?',
    a: 'United States and Canada in Phase 1. UK sunglasses-only coming later in 2026.',
  },
  {
    q: 'How long does delivery take?',
    a: 'Non-Rx orders: 5–7 business days. Rx orders: 10–14 business days from prescription approval.',
  },
  {
    q: 'Can I buy frames without a prescription?',
    a: 'Yes — select "Non-prescription" on the lens picker. You\'ll get plano (zero-power) lenses.',
  },
  {
    q: 'How do I upload my prescription?',
    a: 'After checkout, you\'ll get a secure link by email. Take a clear photo, upload, done.',
  },
  {
    q: 'What if my prescription is expired?',
    a: 'We\'ll pause your order and email you. Please see an eye care professional for a current exam.',
  },
  {
    q: 'Can I return Rx glasses?',
    a: 'Prescription lenses are custom-cut and not resalable. We offer exchanges and remakes, not cash refunds, for Rx orders.',
  },
];

export default function FaqPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
      <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">Support</p>
      <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink mb-10">FAQ</h1>

      <dl className="space-y-6">
        {FAQ.map((item, i) => (
          <div key={i} className="border-b border-line pb-6">
            <dt className="font-sans font-bold text-ink mb-2">{item.q}</dt>
            <dd className="text-muted font-serif">{item.a}</dd>
          </div>
        ))}
      </dl>

      <p className="text-sm text-muted mt-10">
        Can&apos;t find your answer? Email{' '}
        <a href="mailto:hello@glassyvision.com" className="text-accent underline">
          hello@glassyvision.com
        </a>.
      </p>
    </div>
  );
}
