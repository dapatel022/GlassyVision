import { redirect } from 'next/navigation';
import { claimAccount } from '@/features/account/actions/claim-account';

export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ cid?: string; token?: string; exp?: string }> }) {
  const { cid, token, exp } = await searchParams;

  if (!cid || !token || !exp) {
    return <ClaimMessage title="Invalid link" body="This claim link is missing information." />;
  }

  const result = await claimAccount(cid, token, Number(exp));

  if (result.status === 'needsAuth') {
    redirect(`/account/login?next=${encodeURIComponent(`/account/claim?cid=${cid}&token=${token}&exp=${exp}`)}`);
  }
  if (result.status === 'claimed') {
    redirect('/account');
  }
  return <ClaimMessage title="Couldn't link your account" body={result.error} />;
}

function ClaimMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-base">
      <div className="max-w-sm text-center space-y-3">
        <h1 className="font-sans text-xl font-black uppercase text-ink">{title}</h1>
        <p className="text-sm text-muted">{body}</p>
        <a href="/account/login" className="text-accent text-sm underline">Go to sign in</a>
      </div>
    </main>
  );
}
