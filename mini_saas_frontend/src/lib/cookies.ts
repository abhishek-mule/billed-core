export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"))
  return match ? decodeURIComponent(match[2]) : null
}

export function setCookie(name: string, value: string, days = 30) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
}

export function clearAuthCookies() {
  const cookies = ['bz_access', 'bz_refresh', 'bz_tenant', 'bz_tenant_name', 'bz_user_id']
  for (const name of cookies) {
    document.cookie = `${name}=; Max-Age=0; path=/`
  }
}
