import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Secret Hitler — The Table',
  description:
    'The original game of hidden loyalties, played together online. Create a private table for 5–10 friends.',
  robots: { index: false, follow: false },
  icons: { icon: '/assets/logo-transparent.png' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#142720',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
