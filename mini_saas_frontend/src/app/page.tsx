import { redirect } from 'next/navigation'

export default function RootEntry() {
  const tenantId = typeof window !== 'undefined' ? getCookie('bz_tenant') : null

function getCookie(name: string) {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}
  if (tenantId) {
    redirect('/dashboard')
  }
  redirect('/login')
}
