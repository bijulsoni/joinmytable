import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

// Warm display serif for headlines + a clean grotesque for body.
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  axes: ['SOFT', 'WONK', 'opsz'],
  variable: '--font-display',
});

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: {
    default: 'JoinMyTable — Never lunch alone again',
    template: '%s | JoinMyTable',
  },
  description:
    'Share a meal, a coffee, a drink. JoinMyTable matches you with a verified companion for coffee, lunch, happy hour, or dinner.',
  applicationName: 'JoinMyTable',
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#fdf8f1',
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let initialSession = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    initialSession = data.session ?? null;
  } catch {
    // Supabase env not configured yet (early local dev). Fall through
    // with no session — pages still render in logged-out mode.
  }

  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <AuthProvider initialSession={initialSession}>{children}</AuthProvider>
      </body>
    </html>
  );
}
