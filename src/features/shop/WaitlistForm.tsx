'use client';

import { useState } from 'react';

interface WaitlistFormProps {
  dropSlug: string;
}

export default function WaitlistForm({ dropSlug }: WaitlistFormProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('submitting');

    try {
      const res = await fetch('/api/waitlist/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), dropSlug }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('success');
        setMessage(body.message || "You're on the list.");
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
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="flex-1 px-4 py-3 border border-line rounded-lg text-sm font-mono bg-white focus:outline-none focus:border-accent"
        disabled={status === 'submitting' || status === 'success'}
      />
      <button
        type="submit"
        disabled={status === 'submitting' || status === 'success'}
        className="px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light disabled:opacity-50"
      >
        {status === 'submitting' ? 'Joining…' : status === 'success' ? '✓ Joined' : 'Join waitlist'}
      </button>
      {message && (
        <p className={`sm:absolute sm:mt-16 text-sm ${status === 'success' ? 'text-success' : 'text-error'}`}>{message}</p>
      )}
    </form>
  );
}
