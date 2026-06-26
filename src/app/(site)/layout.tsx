import SiteHeader from '@/components/site/SiteHeader';
import SiteFooter from '@/components/site/SiteFooter';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>
      <SiteHeader />
      {/* tabIndex={-1} lets the skip link move focus (not just scroll) in Chromium/Safari */}
      <main id="main-content" tabIndex={-1} className="min-h-[calc(100vh-4rem)] focus:outline-none">{children}</main>
      <SiteFooter />
    </>
  );
}
