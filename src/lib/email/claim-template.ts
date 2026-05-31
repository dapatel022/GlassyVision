export function renderClaimEmail(claimUrl: string): string {
  return `<!doctype html>
<html><body style="font-family: sans-serif; color: #1a1a1a;">
  <h1 style="font-size:20px;">Manage your GlassyVision purchase</h1>
  <p>Create your account to track orders, upload your prescription, and manage your subscription.</p>
  <p><a href="${claimUrl}" style="display:inline-block;padding:12px 20px;background:#1a1a1a;color:#fff;text-decoration:none;">Create my account</a></p>
  <p style="font-size:12px;color:#777;">If you didn't make this purchase, you can ignore this email.</p>
</body></html>`;
}

export function renderClaimEmailText(claimUrl: string): string {
  return [
    'Manage your GlassyVision purchase',
    '',
    'Create your account to track orders, upload your prescription, and manage your subscription:',
    claimUrl,
    '',
    "If you didn't make this purchase, you can ignore this email.",
  ].join('\n');
}
