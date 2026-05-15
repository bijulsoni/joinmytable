import type { Metadata, Viewport } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'JoinMyTable',
    template: '%s | JoinMyTable',
  },
  description: 'Share a meal. Lunch and dinner companionship, on demand.',
  applicationName: 'JoinMyTable',
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#ffffff',
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolve the current session server-side so the first paint already
  // reflects logged-in/out state. The AuthProvider keeps the session in
  // sync on the client via Supabase's onAuthStateChange.
  let initialSession = null;
  try {
    const supabase = createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    initialSession = data.session ?? null;
  } catch {
    // Supabase env not configured yet (early local dev). Fall through
    // with no session - pages still render in logged-out mode.
  }

  return (
    <html lang="en">
      <body>
        <AuthProvider initialSession={initialSession}>{children}</AuthProvider>
      </body>
    </html>
  );
}
