import { clearAuthCookies } from "./cookies"

interface FetchWithAuthOptions extends RequestInit {
  autoRedirect?: boolean
}

export async function fetchWithAuth(url: string, options: FetchWithAuthOptions = {}) {
  const { autoRedirect = true, ...fetchOptions } = options

  const headers: Record<string, string> = { ...(fetchOptions.headers as Record<string, string> | undefined) }
  if (fetchOptions.body) {
    headers["Content-Type"] = "application/json"
  }

  const res = await fetch(url, {
    credentials: "include",
    ...fetchOptions,
    headers,
  })

  if (!res.ok) {
    if (res.status === 401 && autoRedirect) {
      clearAuthCookies()
      if (typeof window !== "undefined") {
        window.location.href = "/auth"
      }
      throw new Error("Session expired. Redirecting to login...")
    }

    let errorMsg: string
    try {
      const errBody = await res.json()
      errorMsg = errBody.error || errBody.message || `Request failed with status ${res.status}`
    } catch {
      errorMsg = `Request failed with status ${res.status}`
    }
    throw new Error(errorMsg)
  }

  return res
}
