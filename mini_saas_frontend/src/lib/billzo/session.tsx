"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { getCookie } from "@/lib/cookies"

interface SessionContextValue {
  userName?: string
  shopName?: string
  userEmail?: string
}

const SessionContext = createContext<SessionContextValue>({})

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionContextValue>({})

  useEffect(() => {
    function readSession() {
      const tenant = getCookie("bz_tenant_name")
      let email: string | undefined
      let name: string | undefined
      try {
        const token = getCookie("bz_access")
        if (token) {
          const payload = JSON.parse(atob(token.split(".")[1]))
          email = payload.email
          name = payload.name
        }
      } catch {}
      setSession({
        userName: name || email?.split("@")[0],
        shopName: tenant ? decodeURIComponent(tenant) : undefined,
        userEmail: email,
      })
    }

    readSession()
    window.addEventListener("focus", readSession)
    return () => window.removeEventListener("focus", readSession)
  }, [])

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  return useContext(SessionContext)
}