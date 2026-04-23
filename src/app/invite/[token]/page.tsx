import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function InviteAcceptPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: invitation } = await supabase
    .from('user_invitations')
    .select('id, email, role, invited_at, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle();

  if (!invitation) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">Invalid invite</h1>
          <p className="text-muted font-serif italic">This link is invalid or has already been used. Contact your admin.</p>
        </div>
      </div>
    );
  }

  const expired = new Date(invitation.expires_at) < new Date();
  if (expired) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">Invite expired</h1>
          <p className="text-muted font-serif italic">This invitation expired on {new Date(invitation.expires_at).toLocaleDateString()}. Ask your admin to send a new one.</p>
        </div>
      </div>
    );
  }

  if (invitation.accepted_at) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-2">Already accepted</h1>
          <p className="text-muted font-serif italic">This invitation has already been used. Sign in at /login.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base flex items-center justify-center px-4">
      <div className="max-w-md w-full p-8 border border-line rounded-xl bg-white">
        <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-1">Welcome</p>
        <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-4">
          You&apos;re invited to GlassyVision
        </h1>

        <dl className="text-sm space-y-2 mb-6">
          <div className="flex justify-between"><dt className="text-muted">Email</dt><dd className="font-mono">{invitation.email}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Role</dt><dd className="font-mono">{invitation.role}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Expires</dt><dd className="font-mono">{new Date(invitation.expires_at).toLocaleDateString()}</dd></div>
        </dl>

        <div className="p-3 bg-base-deeper border border-line rounded-lg text-sm text-muted">
          <p className="mb-2">
            <strong>Account setup is coming in Week 5.</strong>
          </p>
          <p>
            Your invite is valid. An admin will complete your account setup manually for now.
            Ping hello@glassyvision.com with this link.
          </p>
        </div>
      </div>
    </div>
  );
}
