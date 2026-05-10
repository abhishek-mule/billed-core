import type { Metadata, Viewport } from 'next';
import { ServiceWorkerRegister } from '@/components/billzo/ServiceWorkerRegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'Billzo | Money Recovery Console',
  description: 'Automate your daily cash recovery.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#146c4b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
