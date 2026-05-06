import { redirect } from 'next/navigation'

export default function RootEntry() {
  const tenantId = typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null
  if (tenantId) {
    redirect('/dashboard')
  }
  redirect('/login')
}
