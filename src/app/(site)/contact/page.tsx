export const metadata = { title: 'Contact' };

export default function ContactPage() {
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16 text-center">
      <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">Talk to us</p>
      <h1 className="font-sans text-4xl font-black tracking-tight uppercase text-ink mb-8">Contact</h1>
      <p className="text-muted font-serif italic mb-6">
        Email works best. We read everything and reply within one business day.
      </p>
      <a
        href="mailto:hello@glassyvision.com"
        className="inline-block px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light"
      >
        hello@glassyvision.com
      </a>
    </div>
  );
}
