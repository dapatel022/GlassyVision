'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface FilterDrawerProps {
  activeCount: number;
  children: ReactNode;
}

/** Mobile-only bottom sheet wrapping the filter sidebar. */
export default function FilterDrawer({ activeCount, children }: FilterDrawerProps) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    // Capture the trigger node at effect time (it's always mounted) so the
    // cleanup restores focus without reading the ref post-cleanup.
    const trigger = triggerRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-mono font-bold uppercase tracking-wider text-ink border border-line rounded-lg px-4 py-2 hover:border-accent transition-colors"
      >
        Filters{activeCount > 0 ? ` (${activeCount})` : ''}
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/40 w-full h-full cursor-default"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="absolute bottom-0 inset-x-0 max-h-[80vh] overflow-y-auto bg-white rounded-t-2xl border-t border-line p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-ink">Filters</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs font-mono font-bold uppercase tracking-wider text-accent"
              >
                Done
              </button>
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
