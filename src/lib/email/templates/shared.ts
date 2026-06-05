export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** HTML-entity-encode text/attribute content so customer-supplied values
 *  (names, etc.) and ampersands in URLs can't break out of context. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Shared shell so every lifecycle email looks identical: brand wordmark,
 *  a lead paragraph, an optional CTA button, and an optional footnote. All
 *  inputs are pre-escaped by the caller. */
export function emailShell(opts: {
  lead: string;
  ctaHref?: string;
  ctaLabel?: string;
  footnote?: string;
}): string {
  const cta =
    opts.ctaHref && opts.ctaLabel
      ? `<p style="margin: 24px 0;"><a href="${opts.ctaHref}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:#fff;text-decoration:none;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;font-size:13px;border-radius:6px;">${opts.ctaLabel}</a></p>`
      : '';
  const footnote = opts.footnote
    ? `<p style="color: #999; font-size: 12px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">${opts.footnote}</p>`
    : '';
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <h1 style="font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.01em; margin: 0 0 24px 0;">GlassyVision</h1>
  <p style="font-size: 16px; line-height: 1.5;">${opts.lead}</p>
  ${cta}
  ${footnote}
</body></html>`;
}
