'use client';

import { useState } from 'react';

export default function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('submitting');

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('success');
        setMessage(body.message || 'Thanks — see you in your inbox.');
        setEmail('');
      } else {
        setStatus('error');
        setMessage(body.error || 'Could not sign up. Try again?');
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Try again?');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="newsletter-email" className="text-xs font-sans font-bold uppercase tracking-wider text-muted-soft">
        Newsletter
      </label>
      <div className="flex gap-2">
        <input
          id="newsletter-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1 px-3 py-2 border border-line rounded-lg text-sm font-mono bg-white focus:outline-none focus:border-accent"
          disabled={status === 'submitting' || status === 'success'}
        />
        <button
          type="submit"
          disabled={status === 'submitting' || status === 'success'}
          className="px-4 py-2 bg-accent text-white font-sans font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-accent-light disabled:opacity-50"
        >
          {status === 'submitting' ? '…' : 'Join'}
        </button>
      </div>
      {message && (
        <p className={`text-xs ${status === 'success' ? 'text-success' : 'text-error'}`}>{message}</p>
      )}
    </form>
  );
}
