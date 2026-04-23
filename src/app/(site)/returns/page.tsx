export const metadata = { title: 'Returns' };

export default function ReturnsPage() {
  return (
    <article className="max-w-2xl mx-auto px-4 sm:px-6 py-16 prose font-serif text-muted">
      <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2 not-italic">Support</p>
      <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink mb-8">Returns policy</h1>

      {/* LEGAL: pending counsel review — see docs/research/compliance-playbook.md */}
      <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg mb-8 not-italic">
        <p className="text-sm text-warning font-sans">
          Draft policy — pending legal review. Do not rely on this as final terms.
        </p>
      </div>

      <h2>Non-prescription frames</h2>
      <p>30-day return window for unused, unscratched frames. Refund, replacement, or store credit at your choice.</p>

      <h2>Prescription lenses</h2>
      <p>Because Rx lenses are custom-cut, we offer exchange or remake only. Quality issues or our mistakes are remade at our cost. Change-of-mind is store credit.</p>

      <h2>Damaged on arrival</h2>
      <p>Full refund or replacement — no return shipping required. Keep the damaged item.</p>

      <h2>How to start a return</h2>
      <p>Sign in to your account and click &ldquo;Start a return&rdquo; on your order, or email <a href="mailto:hello@glassyvision.com">hello@glassyvision.com</a>.</p>
    </article>
  );
}
