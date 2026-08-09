const STEPS: Array<[string, string, string]> = [
  ['01', 'Choose your tier', 'Solo, Duo, or Trio — one prepaid price for your year. Checkout takes a minute.'],
  ['02', 'Redeem anytime', 'Each pair is a slot in your account. Pick any frame whenever you want it — Rx pairs just need a prescription upload, same as any Rx order.'],
  ['03', 'We craft & ship', 'Every pair is cut and finished in our lab, quality-checked, and shipped to your door. US + Canada.'],
];

export default function MembershipHowItWorks() {
  return (
    <section aria-label="How membership works">
      <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-soft border-b border-line pb-2">
        How it works
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        {STEPS.map(([n, title, body]) => (
          <div key={n} className="bg-white border border-line rounded-2xl p-6">
            <span className="font-mono text-xs font-bold text-accent">{n}</span>
            <h3 className="font-sans font-black text-sm uppercase text-ink mt-2">{title}</h3>
            <p className="font-serif italic text-xs text-muted leading-relaxed mt-2">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
