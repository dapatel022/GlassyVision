export const metadata = { title: 'Rx disclaimer' };

export default function RxDisclaimerPage() {
  return (
    <article className="max-w-2xl mx-auto px-4 sm:px-6 py-16 prose font-serif text-muted">
      <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2 not-italic">Important</p>
      <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink mb-8">
        Prescription disclaimer
      </h1>

      {/* LEGAL: FTC Eyeglass Rule compliance — pending counsel review */}
      <p className="font-sans text-ink not-italic text-lg leading-relaxed">
        Online eyewear is not a substitute for a comprehensive eye examination.
      </p>

      <h2>Our role</h2>
      <p>GlassyVision does not perform eye exams and does not verify prescriptions with your eye care professional. By uploading a prescription, you certify it is current, valid, and issued to you by a licensed eye care professional.</p>

      <h2>Your responsibility</h2>
      <p>You are responsible for the accuracy of the prescription you upload. We strongly recommend a yearly eye exam and only using a prescription that is unexpired per your state or province&apos;s rules.</p>

      <h2>Our review</h2>
      <p>We review every uploaded prescription for readability and plausibility before producing your lenses. We do not validate medical accuracy. If we spot an obvious error (expired, mismatched, or implausible values) we&apos;ll pause the order and email you.</p>

      <h2>Questions</h2>
      <p>Email <a href="mailto:hello@glassyvision.com">hello@glassyvision.com</a>.</p>
    </article>
  );
}
