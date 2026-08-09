'use client';

import { useEffect, useState } from 'react';

/** Mobile-only bar after scrolling past the hero. Hidden for active members (show=false). */
export default function MembershipStickyCTA({ show }: { show: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;
    const onScroll = () => setVisible(window.scrollY > 480);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [show]);

  if (!show || !visible) return null;
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-ink/95 backdrop-blur border-t border-white/10 p-3">
      <a
        href="#tiers"
        className="block w-full text-center px-4 py-3 bg-white text-ink font-sans font-bold text-xs uppercase tracking-widest"
      >
        Choose your tier →
      </a>
    </div>
  );
}
