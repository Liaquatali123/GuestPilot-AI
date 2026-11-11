import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'GuestPilot AI',
  description:
    'Complete Guest Posting Reseller Business Management Software with real-time Firebase persistence, website & supplier catalogs, client CRM, pricing calculator, order pipeline, email assistant, SSRF-safe backlink verification, and PDF delivery reports.',
  openGraph: {
    title: 'GuestPilot AI',
    description:
      'Complete Guest Posting Reseller Business Management Software with real-time Firebase persistence, website & supplier catalogs, client CRM, pricing calculator, order pipeline, email assistant, SSRF-safe backlink verification, and PDF delivery reports.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GuestPilot AI',
    description:
      'Complete Guest Posting Reseller Business Management Software with real-time Firebase persistence, website & supplier catalogs, client CRM, pricing calculator, order pipeline, email assistant, SSRF-safe backlink verification, and PDF delivery reports.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${plusJakarta.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="bg-zinc-950 text-zinc-100 antialiased selection:bg-emerald-500/30 selection:text-emerald-200"
      >
        {children}
      </body>
    </html>
  );
}

