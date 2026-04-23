import type { Metadata } from 'next';
import { Inter_Tight, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { CartProvider } from '@/context/CartContext';

const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
  weight: ['400', '600', '800', '900'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  weight: ['400', '700'],
});

export const metadata: Metadata = {
  title: {
    default: 'GlassyVision — Eyewear, Dropped.',
    template: '%s | GlassyVision',
  },
  description:
    'Small-batch eyewear, hand-finished in India, shipped worldwide. Sunglasses and prescription glasses released in limited drops.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,400;1,300;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${interTight.variable} ${jetbrainsMono.variable} antialiased bg-base text-ink`}
      >
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
