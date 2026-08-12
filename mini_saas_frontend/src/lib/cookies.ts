export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"))
  return match ? decodeURIComponent(match[2]) : null
}

export function setCookie(name: string, value: string, days = 30) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
}

/**
 * Clear the full auth session client-side.
 *
 * bz_access / bz_refresh are httpOnly and cannot be deleted from JS, so we
 * first ask the server to clear them (and revoke the session) via the logout
 * endpoint — otherwise the middleware still treats the user as authenticated
 * and bounces /auth to /onboarding instead of showing the login page.
 * Await it before navigating to /auth to avoid a race on the Set-Cookie.
 */
export async function clearAuthCookies() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  } catch {
    /* best-effort — still clear what we can client-side */
  }
  const cookies = ['bz_access', 'bz_refresh', 'bz_tenant', 'bz_tenant_name', 'bz_user_id']
  for (const name of cookies) {
    document.cookie = `${name}=; Max-Age=0; path=/`
  }
}
