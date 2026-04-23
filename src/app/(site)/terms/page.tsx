export const metadata = { title: 'Terms of service' };

export default function TermsPage() {
  return (
    <article className="max-w-2xl mx-auto px-4 sm:px-6 py-16 prose font-serif text-muted">
      <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2 not-italic">Legal</p>
      <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink mb-8">Terms of service</h1>

      {/* LEGAL: pending counsel review */}
      <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg mb-8 not-italic">
        <p className="text-sm text-warning font-sans">
          Draft terms — pending legal review. Do not rely on this as final terms.
        </p>
      </div>

      <p>By using GlassyVision you agree to these terms. We ship to the United States and Canada only. Prescriptions must be valid, unexpired, and issued to the purchaser.</p>
      <p>Online eyewear is not a substitute for a comprehensive eye examination. See the <a href="/rx-disclaimer">Rx disclaimer</a> for details.</p>
      <p>Prices, availability, and specifications may change. Full terms finalized by counsel before public launch.</p>
    </article>
  );
}
