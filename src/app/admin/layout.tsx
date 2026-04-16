import { redirect } from 'next/navigation';
import { getCurrentUser, isAdminRole } from '@/lib/auth/middleware';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/admin');
  }

  if (!isAdminRole(user.role)) {
    redirect('/unauthorized');
  }

  return (
    <div className="min-h-screen bg-base">
      <header className="sticky top-0 z-50 bg-ink text-base px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-sans font-black text-sm tracking-wider uppercase">
            GlassyVision<span className="text-accent">.</span> Admin
          </span>
        </div>
        <div className="font-mono text-xs text-muted-soft">
          {user.fullName || user.email} · {user.role}
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
