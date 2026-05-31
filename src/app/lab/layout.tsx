import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, isLabRole } from '@/lib/auth/middleware';

export const dynamic = 'force-dynamic';

export default async function LabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/lab');
  }

  if (!isLabRole(user.role)) {
    redirect('/unauthorized');
  }

  return (
    <div className="min-h-screen bg-base">
      <header className="sticky top-0 z-50 bg-ink text-base px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/lab" className="font-sans font-black text-sm tracking-wider uppercase text-white hover:text-tortoise transition-colors">
            GlassyVision<span className="text-tortoise">.</span> Lab
          </Link>
          <span className="text-line/20 font-mono text-xs hidden md:inline">|</span>
          <nav className="hidden md:flex items-center gap-4 text-xs font-mono">
            <Link href="/lab" className="text-muted-soft hover:text-white transition">Workbench</Link>
            <Link href="/lab/shipping" className="text-muted-soft hover:text-white transition">Shipping Dispatch</Link>
            <Link href="/admin" className="text-muted-soft hover:text-white transition">Admin Panel</Link>
          </nav>
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
