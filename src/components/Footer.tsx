import Link from 'next/link';
import { Facebook, Twitter, Instagram, Youtube } from 'lucide-react';

export default function Footer() {
    return (
        <footer className="bg-primary text-white pt-16 pb-8">
            <div className="container mx-auto px-4">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-12">
                    <div className="col-span-2 lg:col-span-2">
                        <Link href="/" className="text-3xl font-bold tracking-tight mb-6 block">
                            LENSABL
                        </Link>
                        <p className="text-blue-200 max-w-sm mb-6">
                            The smarter way to buy eyewear. Replace lenses in your frames or shop our collection of designer brands.
                        </p>
                        <div className="flex gap-4">
                            <Link href="#" className="hover:text-accent transition-colors"><Facebook className="w-5 h-5" /></Link>
                            <Link href="#" className="hover:text-accent transition-colors"><Twitter className="w-5 h-5" /></Link>
                            <Link href="#" className="hover:text-accent transition-colors"><Instagram className="w-5 h-5" /></Link>
                            <Link href="#" className="hover:text-accent transition-colors"><Youtube className="w-5 h-5" /></Link>
                        </div>
                    </div>

                    <div>
                        <h4 className="font-bold text-lg mb-6">Shop</h4>
                        <ul className="space-y-4 text-blue-200">
                            <li><Link href="#" className="hover:text-white transition-colors">Lens Replacement</Link></li>
                            <li><Link href="#" className="hover:text-white transition-colors">Frames</Link></li>
                            <li><Link href="#" className="hover:text-white transition-colors">Contacts</Link></li>
                            <li><Link href="#" className="hover:text-white transition-colors">Gift Cards</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-bold text-lg mb-6">Support</h4>
                        <ul className="space-y-4 text-blue-200">
                            <li><Link href="#" className="hover:text-white transition-colors">Help Center</Link></li>
                            <li><Link href="#" className="hover:text-white transition-colors">Order Status</Link></li>
                            <li><Link href="#" className="hover:text-white transition-colors">Returns</Link></li>
                            <li><Link href="#" className="hover:text-white transition-colors">Contact Us</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-bold text-lg mb-6">Company</h4>
                        <ul className="space-y-4 text-blue-200">
                            <li><Link href="#" className="hover:text-white transition-colors">About Us</Link></li>
                            <li><Link href="#" className="hover:text-white transition-colors">Reviews</Link></li>
                            <li><Link href="#" className="hover:text-white transition-colors">Blog</Link></li>
                            <li><Link href="#" className="hover:text-white transition-colors">Careers</Link></li>
                        </ul>
                    </div>
                </div>

                <div className="border-t border-blue-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-blue-300">
                    <p>&copy; {new Date().getFullYear()} Lensabl Inc. All rights reserved.</p>
                    <div className="flex gap-6">
                        <Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link>
                        <Link href="#" className="hover:text-white transition-colors">Terms of Service</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
