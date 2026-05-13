import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'BillZo - Get Paid Faster',
}

export default function RootEntry() {
  redirect('/auth')
}