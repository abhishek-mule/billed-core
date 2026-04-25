'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, createContext, useContext } from 'react'
import Link from 'next/link'
import { 
  Home, 
  Receipt, 
  Users, 
  Package, 
  LogOut, 
  Languages, 
  Bell,
  Search,
  Mic,
  Camera,
  Plus,
  Settings as SettingsIcon,
  User
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface SessionInfo {
  tenantId: string
  companyName: string
  role: string
}

const SessionContext = createContext<SessionInfo | null>(null)

export function useSession() {
  return useContext(SessionContext)
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/session')
        if (res.ok) {
          const data = await res.json()
          setSession(data.session)
        } else if (pathname !== '/start') {
          router.push('/start')
        }
      } catch {
        if (pathname !== '/start') {
          router.push('/start')
        }
      } finally {
        setLoading(false)
      }
    }

    checkSession()
  }, [pathname, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session && pathname !== '/start') {
    return null
  }

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

const navItems = [
  { href: '/merchant', label: 'Home', Icon: Home },
  { href: '/merchant/invoice', label: 'Invoices', Icon: Receipt },
  { href: '/merchant/settings', label: 'Settings', Icon: SettingsIcon },
]

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const session = useSession()
  const [lang, setLang] = useState<'en' | 'hi'>('en')
  const [isOnline, setIsOnline] = useState(true)
  const [searchFocused, setSearchFocused] = useState(false)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/start'
  }

  const isHome = pathname === '/merchant'

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1C1E] font-sans selection:bg-blue-500/30 selection:text-blue-900 pb-24 lg:pb-0 lg:pl-72">
      {/* Sidebar for Desktop */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-200 flex-col shadow-sm">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <span className="text-xl font-black italic">B</span>
          </div>
          <span className="text-2xl font-bold text-[#1A1C1E] tracking-tight">BillZo</span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/merchant' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  isActive 
                    ? 'bg-blue-50 text-blue-600 shadow-sm' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-[#1A1C1E]'
                }`}
              >
                <item.Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-all"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Header */}
      <header className={`sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-4 transition-all duration-300 ${searchFocused ? 'py-2' : 'py-4'}`}>
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#1A1C1E] tracking-tight">BillZo</h1>
          </div>
          <div className="flex items-center gap-3">
             <button className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 border border-slate-200">
              <User className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar - Matching Screenshot 4 */}
        <div className="mt-4 max-w-5xl mx-auto px-1">
          <div className={`relative flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 border transition-all duration-200 ${searchFocused ? 'border-blue-500 ring-2 ring-blue-500/10 bg-white' : 'border-transparent'}`}>
            <Search className={`w-5 h-5 ${searchFocused ? 'text-blue-500' : 'text-slate-400'}`} />
            <input 
              type="text" 
              placeholder="Search name or amount..." 
              className="flex-1 bg-transparent border-none focus:outline-none text-sm font-medium text-[#1A1C1E] placeholder:text-slate-400"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            <button className="p-1 text-slate-400 hover:text-slate-600">
              <Mic className="w-4 h-4" />
            </button>
            <button className="p-1 text-slate-400 hover:text-slate-600 border-l border-slate-200 pl-2 ml-1">
              <Camera className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-5xl px-4 py-4 min-h-[calc(100vh-200px)]">
        {children}
      </main>

      {/* FAB - Matching Screenshot 4 */}
      <Link 
        href="/merchant/invoice/new"
        className="fixed right-6 bottom-24 lg:bottom-10 z-50 w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xl shadow-blue-600/30 active:scale-95 transition-transform group"
      >
        <Plus className="w-8 h-8 group-hover:rotate-90 transition-transform duration-300" />
        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white" />
      </Link>

      {/* Bottom Nav for Mobile */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 safe-area-pb">
        <div className="flex items-center justify-around px-2 py-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/merchant' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 min-w-[64px] py-2 transition-all ${
                  isActive ? 'text-blue-600' : 'text-slate-400'
                }`}
              >
                <div className={`p-1 rounded-xl transition-all ${isActive ? 'bg-blue-50' : ''}`}>
                  <item.Icon className="w-6 h-6" />
                </div>
                <span className={`text-[10px] font-bold tracking-tight ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <LayoutContent>{children}</LayoutContent>
    </AuthGuard>
  )
}