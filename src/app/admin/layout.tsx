import { redirect } from 'next/navigation';
import Link from 'next/link';
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
          <Link href="/admin" className="font-sans font-black text-sm tracking-wider uppercase text-white hover:text-accent transition-colors">
            GlassyVision<span className="text-accent">.</span> Admin
          </Link>
          <span className="text-line/20 font-mono text-xs hidden md:inline">|</span>
          <nav className="hidden md:flex items-center gap-4 text-xs font-mono">
            <Link href="/admin" className="text-muted-soft hover:text-white transition">Dashboard</Link>
            <Link href="/admin/rx-queue" className="text-muted-soft hover:text-white transition">Rx Queue</Link>
            <Link href="/admin/drops" className="text-muted-soft hover:text-white transition">Drops</Link>
            <Link href="/admin/inventory" className="text-muted-soft hover:text-white transition">Inventory</Link>
            <Link href="/admin/returns" className="text-muted-soft hover:text-white transition">Returns</Link>
            <Link href="/admin/team" className="text-muted-soft hover:text-white transition">Team</Link>
            <Link href="/lab" className="text-muted-soft hover:text-white transition">Lab Workbench</Link>
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
