'use client';

import { useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';

export default function AccountLoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = createBrowserClient();
    const next = new URLSearchParams(window.location.search).get('next') || '/account';
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/account/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (authError) { setError(authError.message); setLoading(false); return; }
    setSent(true);
    setLoading(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-base">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink">GlassyVision<span className="text-accent">.</span></h1>
          <p className="font-serif italic text-muted text-sm mt-2">Your account</p>
        </div>
        {sent ? (
          <p className="text-center text-sm text-ink">Check your email for a sign-in link.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-4 py-3 bg-white border border-line text-ink font-sans text-sm focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none" />
            {error && <p className="text-error text-xs font-mono">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-ink text-base font-sans font-bold text-xs tracking-widest uppercase disabled:opacity-50">
              {loading ? 'Sending...' : 'Email me a sign-in link'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
