import Link from 'next/link';
import { Search, ShoppingCart, User, Menu } from 'lucide-react';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm">
      {/* Top Banner */}
      <div className="bg-primary text-white text-center py-2 text-sm font-medium">
        <p>DECEMBER SALE | UP TO 50% OFF LENSES & FRAMES</p>
      </div>

      {/* Main Nav */}
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">
        {/* Mobile Menu & Logo */}
        <div className="flex items-center gap-4">
          <button className="lg:hidden">
            <Menu className="w-6 h-6 text-primary" />
          </button>
          <Link href="/" className="text-2xl font-bold text-primary tracking-tight">
            LENSABL
          </Link>
        </div>

        {/* Desktop Links */}
        <nav className="hidden lg:flex items-center gap-8 font-medium text-primary">
          <Link href="/lens-replacement" className="hover:text-accent transition-colors">Lens Replacement</Link>
          <Link href="#" className="hover:text-accent transition-colors">Frames</Link>
          <Link href="#" className="hover:text-accent transition-colors">Contacts</Link>
          <Link href="#" className="hover:text-accent transition-colors">Prescription Renewal</Link>
        </nav>

        {/* Icons */}
        <div className="flex items-center gap-6 text-primary">
          <button className="hover:text-accent transition-colors">
            <Search className="w-5 h-5" />
          </button>
          <Link href="#" className="hover:text-accent transition-colors hidden sm:block">
            <User className="w-5 h-5" />
          </Link>
          <Link href="#" className="hover:text-accent transition-colors relative">
            <ShoppingCart className="w-5 h-5" />
            <span className="absolute -top-2 -right-2 bg-accent text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              0
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
