'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createInvitation } from '../actions/invite-user';

const ROLES = ['founder', 'reviewer', 'lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping'] as const;

type Role = (typeof ROLES)[number];

interface Props {
  invitedByUserId: string;
}

export default function InviteForm({ invitedByUserId }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('lab_operator');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInviteUrl(null);

    const result = await createInvitation(email, role, invitedByUserId);
    if (result.success && result.inviteUrl) {
      setInviteUrl(result.inviteUrl);
      setEmail('');
      router.refresh();
    } else {
      setError(result.error ?? 'Failed to invite');
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 border border-line rounded-xl bg-white">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="new.member@example.com"
            className="w-full px-3 py-2 border border-line rounded-lg text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm"
          >
            {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Send invite'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-error mt-3">{error}</p>
      )}
      {inviteUrl && (
        <div className="mt-3 p-3 bg-success/10 border border-success/20 rounded-lg">
          <p className="text-sm font-bold text-success mb-1">Invite created</p>
          <p className="text-xs text-muted mb-2">
            Email delivery not wired yet — copy this link and send it to the invitee manually:
          </p>
          <code className="block text-xs break-all bg-white p-2 border border-line rounded">{inviteUrl}</code>
        </div>
      )}
    </form>
  );
}
