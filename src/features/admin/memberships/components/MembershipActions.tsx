'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelMembership } from '../actions/cancel-membership';
import {
  expireMembership,
  freezeMembership,
  unfreezeMembership,
  resolveDispute,
  resendMembershipEmail,
  type ResendableEmailType,
} from '../actions/admin-membership-ops';

interface Props {
  membershipId: string;
  status: string;
}

const RESENDABLE: { type: ResendableEmailType; label: string }[] = [
  { type: 'membership_welcome', label: 'Welcome' },
  { type: 'slot_unlocked', label: 'Slot unlocked' },
  { type: 'expiry_warning', label: 'Expiry warning' },
  { type: 'renewal_offer', label: 'Renewal offer' },
];

export default function MembershipActions({ membershipId, status }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [resendType, setResendType] = useState<ResendableEmailType>('membership_welcome');

  const isActiveLike = status === 'active' || status === 'grace';
  const isFrozen = status === 'frozen';
  const isDisputed = status === 'disputed';

  async function run(fn: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (res.success) {
      setNotice(ok);
      router.refresh();
    } else {
      setError(res.error ?? 'Action failed');
    }
  }

  const btn = 'px-4 py-2 font-sans font-bold text-xs uppercase tracking-wider rounded-lg disabled:opacity-50';

  return (
    <div className="space-y-4 p-6 border border-line rounded-xl bg-white">
      <h2 className="font-sans text-sm font-black uppercase tracking-wider text-ink">Admin actions</h2>

      {isDisputed && (
        <div className="space-y-2 p-3 border border-amber-300 rounded-lg bg-amber-50">
          <p className="text-xs font-sans text-amber-800">
            This membership is under a chargeback dispute. Slots are frozen. Resolve in
            the merchant&apos;s favour to reactivate, or cancel/expire to settle a lost dispute.
          </p>
          <button
            disabled={busy}
            onClick={() => run(() => resolveDispute({ membershipId }), 'Dispute resolved — membership reactivated.')}
            className={`${btn} bg-accent text-white`}
          >
            Resolve dispute (won)
          </button>
        </div>
      )}

      {(isActiveLike || isFrozen || isDisputed) && (
        <div className="space-y-2">
          <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft">
            Cancel reason
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm"
            placeholder="Why are you cancelling?"
          />
          <button
            disabled={busy || !reason.trim()}
            onClick={() => run(() => cancelMembership({ membershipId, reason: reason.trim() }), 'Cancelled + pro-rata refund issued.')}
            className={`${btn} bg-error text-white`}
          >
            Cancel + refund
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(isActiveLike || isDisputed) && (
          <button disabled={busy} onClick={() => run(() => expireMembership({ membershipId }), 'Membership expired.')} className={`${btn} bg-ink text-white`}>
            Manual expire
          </button>
        )}
        {isActiveLike && (
          <button disabled={busy} onClick={() => run(() => freezeMembership({ membershipId }), 'Membership frozen.')} className={`${btn} bg-amber-600 text-white`}>
            Freeze
          </button>
        )}
        {isFrozen && (
          <button disabled={busy} onClick={() => run(() => unfreezeMembership({ membershipId }), 'Membership unfrozen.')} className={`${btn} bg-accent text-white`}>
            Unfreeze
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-line">
        <div>
          <label className="block text-xs font-sans font-bold uppercase tracking-wider text-muted-soft mb-1">Resend email</label>
          <select value={resendType} onChange={(e) => setResendType(e.target.value as ResendableEmailType)} className="px-3 py-2 border border-line rounded-lg text-sm">
            {RESENDABLE.map((r) => <option key={r.type} value={r.type}>{r.label}</option>)}
          </select>
        </div>
        <button disabled={busy} onClick={() => run(() => resendMembershipEmail({ membershipId, type: resendType }), 'Email resent.')} className={`${btn} bg-ink text-white`}>
          Resend
        </button>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}
      {notice && <p className="text-sm text-accent">{notice}</p>}
    </div>
  );
}
