export const metadata = { title: 'Privacy policy' };

export default function PrivacyPage() {
  return (
    <article className="max-w-2xl mx-auto px-4 sm:px-6 py-16 prose font-serif text-muted">
      <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2 not-italic">Legal</p>
      <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink mb-8">Privacy policy</h1>

      {/* LEGAL: pending counsel review — CCPA (CA), PIPEDA (CA province), GDPR consideration */}
      <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg mb-8 not-italic">
        <p className="text-sm text-warning font-sans">
          Draft policy — pending legal review. Do not rely on this as final terms.
        </p>
      </div>

      <h2>What we collect</h2>
      <p>Contact info, order history, shipping addresses, and prescription images you upload.</p>

      <h2>How long we keep prescriptions</h2>
      <p>Rx files are retained for 3 years per FTC Eyeglass Rule. You may request earlier deletion; we&apos;ll comply unless retention is legally required.</p>

      <h2>Who we share with</h2>
      <p>Shopify (payment processing), Supabase (data storage), Resend (email), Sentry (error monitoring), and our fulfillment lab. We do not sell or rent your data.</p>

      <h2>Your rights</h2>
      <p>Access, correct, delete, or export your data. Email <a href="mailto:privacy@glassyvision.com">privacy@glassyvision.com</a>.</p>
    </article>
  );
}
