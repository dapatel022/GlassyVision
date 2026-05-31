import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/lib/auth/customer';

export const metadata = { title: 'Account' };

export default async function AccountPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/account/login?next=/account');

  return (
    <main className="min-h-screen bg-base px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8">
        <header>
          <h1 className="font-sans text-2xl font-black uppercase text-ink">Your account</h1>
          <p className="text-sm text-muted mt-1">{customer.email}</p>
        </header>
        <section className="border border-line bg-white p-6">
          <h2 className="font-sans text-sm font-bold uppercase tracking-widest text-ink">Subscription</h2>
          <p className="text-sm text-muted mt-2">Your subscription dashboard will appear here.</p>
        </section>
        <form action="/account/auth/signout" method="post">
          <button type="submit" className="text-xs font-mono text-muted underline">Sign out</button>
        </form>
      </div>
    </main>
  );
}
