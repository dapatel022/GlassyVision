import Link from 'next/link';
import NewsletterForm from './NewsletterForm';

const COLUMNS = [
  {
    title: 'Shop',
    links: [
      { href: '/shop', label: 'All frames' },
      { href: '/drops', label: 'Drops' },
      { href: '/lookbook', label: 'Lookbook' },
    ],
  },
  {
    title: 'About',
    links: [
      { href: '/story', label: 'Our story' },
      { href: '/made-in-india', label: 'Made in India' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Support',
    links: [
      { href: '/faq', label: 'FAQ' },
      { href: '/returns', label: 'Returns' },
      { href: '/rx-disclaimer', label: 'Rx disclaimer' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-base mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-2 md:grid-cols-6 gap-8">
        <div className="col-span-2">
          <Link href="/" className="font-sans text-lg font-black tracking-tight uppercase text-ink">
            GLASSYVISION<span className="text-accent">.</span>
          </Link>
          <p className="text-sm text-muted mt-3 max-w-xs font-serif italic">
            Small-batch eyewear, hand-finished in India, shipped worldwide.
          </p>
          <div className="mt-6 max-w-xs">
            <NewsletterForm />
          </div>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-3">{col.title}</p>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-ink hover:text-accent transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-muted-soft">
          <p>© {new Date().getFullYear()} GlassyVision. All rights reserved.</p>
          <p className="font-mono">hello@glassyvision.com</p>
        </div>
      </div>
    </footer>
  );
}
