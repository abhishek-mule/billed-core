import { useContext } from 'react'
import { createContext } from 'react'

interface SessionInfo {
  tenantId: string
  companyName: string
  role: string
  erpMode: 'live' | 'mock'
}

const SessionContext = createContext<SessionInfo | null>(null)

export function useSession() {
  return useContext(SessionContext)
}

export { SessionContext }