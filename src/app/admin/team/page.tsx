import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/middleware';
import { createAdminClient } from '@/lib/supabase/admin';
import InviteForm from '@/features/admin/team/components/InviteForm';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/admin/team');

  const supabase = createAdminClient();
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, role, full_name, last_active_at')
    .order('role');

  const { data: invitations } = await supabase
    .from('user_invitations')
    .select('id, email, role, invited_at, expires_at, accepted_at')
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('invited_at', { ascending: false });

  return (
    <div>
      <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-6">Team</h1>

      <section className="mb-10">
        <h2 className="font-sans font-bold text-sm uppercase tracking-wider text-muted-soft mb-3">Active members</h2>
        <div className="border border-line rounded-xl bg-white divide-y divide-line">
          {(profiles ?? []).map((p) => (
            <div key={p.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-sans font-bold text-sm text-ink">{p.full_name || p.email}</p>
                <p className="text-xs text-muted font-mono">{p.email}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-base-deeper text-muted font-mono uppercase tracking-wider">
                {p.role}
              </span>
            </div>
          ))}
          {(!profiles || profiles.length === 0) && (
            <p className="p-6 text-muted font-serif italic">No active members yet.</p>
          )}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="font-sans font-bold text-sm uppercase tracking-wider text-muted-soft mb-3">Pending invitations</h2>
        <div className="border border-line rounded-xl bg-white divide-y divide-line">
          {(invitations ?? []).map((inv) => (
            <div key={inv.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-sans font-bold text-sm text-ink">{inv.email}</p>
                <p className="text-xs text-muted font-mono">
                  expires {new Date(inv.expires_at).toLocaleDateString()}
                </p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-warning/10 text-warning font-mono uppercase tracking-wider">
                {inv.role}
              </span>
            </div>
          ))}
          {(!invitations || invitations.length === 0) && (
            <p className="p-6 text-muted font-serif italic">No pending invitations.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-sans font-bold text-sm uppercase tracking-wider text-muted-soft mb-3">Invite someone</h2>
        <InviteForm invitedByUserId={user.id} />
      </section>
    </div>
  );
}
