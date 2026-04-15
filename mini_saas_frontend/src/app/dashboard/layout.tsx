import type { Metadata } from 'next'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Billed - Dashboard',
  description: 'Free GST Billing Software for Indian Retailers',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background antialiased">
        {children}
      </body>
    </html>
  )
}
