"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

/**
 * Root entry. Normally sends unauthenticated users to /auth.
 *
 * Auth-param guard (magic-link loop fix): if a Supabase magic link lands on
 * the site root instead of /auth/callback (Site-URL fallback when
 * emailRedirectTo isn't allowlisted, email-client URL mangling, …), the old
 * unconditional redirect silently discarded ?token_hash / ?code / #access_token
 * and the user bounced back to the login page with no error. Forward any auth
 * params intact to /auth/callback, which already handles every form
 * (query token_hash/code/error + hash access_token/error).
 * This makes zero trust decisions — pure param forwarding.
 */
export default function RootEntry() {
  const router = useRouter()

  useEffect(() => {
    const search = window.location.search
    const hash = window.location.hash
    const params = new URLSearchParams(search)
    const hasQueryToken = params.has("token_hash") || params.has("code") || params.has("error")
    const hasHashToken = hash.includes("access_token=") || hash.includes("error=")
    if (hasQueryToken || hasHashToken) {
      router.replace(`/auth/callback${search}${hash}`)
    } else {
      router.replace("/auth")
    }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex items-center gap-3 text-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading...</span>
      </div>
    </div>
  )
}
