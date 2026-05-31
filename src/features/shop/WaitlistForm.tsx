'use client';

import { useState } from 'react';

interface WaitlistFormProps {
  dropSlug: string;
}

export default function WaitlistForm({ dropSlug }: WaitlistFormProps) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [showPhone, setShowPhone] = useState(false);
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
        body: JSON.stringify({
          email: email.trim(),
          dropSlug,
          phone: showPhone && phone.trim() ? phone.trim() : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('success');
        setMessage(body.message || "You're on the list.");
        setEmail('');
        setPhone('');
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left max-w-md mx-auto">
      <div className="flex flex-col sm:flex-row gap-2">
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
          className="px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light disabled:opacity-50 transition-colors"
        >
          {status === 'submitting' ? 'Joining…' : status === 'success' ? '✓ Joined' : 'Join waitlist'}
        </button>
      </div>

      <div className="flex flex-col gap-2 items-start pl-1">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showPhone}
            onChange={(e) => setShowPhone(e.target.checked)}
            className="rounded border-line text-accent focus:ring-accent"
            disabled={status === 'submitting' || status === 'success'}
          />
          <span className="text-xs text-muted-soft font-sans font-bold uppercase tracking-wider">
            Notify me via SMS (Optional)
          </span>
        </label>

        {showPhone && (
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 (555) 000-0000"
            className="w-full px-4 py-3 border border-line rounded-lg text-sm font-mono bg-white focus:outline-none focus:border-accent animate-fade-in-up"
            disabled={status === 'submitting' || status === 'success'}
          />
        )}
      </div>

      {message && (
        <p className={`text-sm text-center ${status === 'success' ? 'text-success' : 'text-error'}`}>{message}</p>
      )}
    </form>
  );
}
