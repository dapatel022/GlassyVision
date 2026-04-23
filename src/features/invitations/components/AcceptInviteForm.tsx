'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { acceptInvite } from '../actions/accept-invite';

interface Props {
  token: string;
  email: string;
  role: string;
}

export default function AcceptInviteForm({ token, email, role }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await acceptInvite({ token, password, fullName });
    if (result.success) {
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } else {
      setError(result.error ?? 'Failed');
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="text-center py-6">
        <h2 className="font-sans text-xl font-black uppercase text-ink mb-2">Account created ✓</h2>
        <p className="text-muted font-serif italic">Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-sm text-muted">
          Creating account for <strong className="font-mono">{email}</strong> · role <strong>{role}</strong>
        </p>
      </div>
      <div>
        <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Full name</label>
        <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 border border-line rounded-lg text-sm" />
      </div>
      <div>
        <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Password</label>
        <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border border-line rounded-lg text-sm font-mono" placeholder="min 8 characters" />
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      <button type="submit" disabled={submitting} className="w-full px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light disabled:opacity-50">
        {submitting ? 'Creating…' : 'Create account'}
      </button>
    </form>
  );
}
