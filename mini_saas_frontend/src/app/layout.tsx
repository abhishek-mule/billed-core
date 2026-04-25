import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Billed - Free GST Billing Software',
  description: 'Beat Zoho & Tally. Free GST billing for Indian retailers.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
