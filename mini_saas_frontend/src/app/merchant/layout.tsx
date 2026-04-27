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
  User,
  BarChart3,
  ShieldCheck,
  AlertCircle,
  Zap
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { OfflineIndicator } from '@/components/OfflineIndicator'

interface SessionInfo {
  tenantId: string
  companyName: string
  role: string
  erpMode: 'live' | 'mock'
}

const SessionContext = createContext<SessionInfo | null>(null)

function useSession() {
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
  { href: '/merchant/pos', label: 'POS', Icon: Zap },
  { href: '/merchant/invoice', label: 'Sales', Icon: Receipt },
  { href: '/merchant/purchases', label: 'Purchases', Icon: Camera },
  { href: '/merchant/customers', label: 'Customers', Icon: Users },
  { href: '/merchant/products', label: 'Inventory', Icon: Package },
  { href: '/merchant/reports', label: 'Reports', Icon: BarChart3 },
  { href: '/merchant/settings', label: 'Settings', Icon: SettingsIcon },
]

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const session = useSession()
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

  const isMock = session?.erpMode === 'mock'

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30 selection:text-primary">
      <OfflineIndicator />
      <AnimatePresence>
        {isMock && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }} 
            animate={{ height: 'auto', opacity: 1 }}
            className="bg-amber-500 text-white text-[10px] font-black uppercase tracking-[0.2em] py-2 text-center sticky top-0 z-[60] flex items-center justify-center gap-2"
          >
            <AlertCircle className="w-3 h-3" />
            Demo Mode — Data not saved to real accounting system
          </motion.div>
        )}
      </AnimatePresence>
      <aside className="sidebar hidden lg:flex">
        <div className="sidebar-brand">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <span className="text-xl font-black italic tracking-tighter">B</span>
          </div>
          <span className="text-2xl font-bold text-white tracking-tight">BillZo</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/merchant' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
              >
                <item.Icon className="w-5 h-5" />
                <span className="font-bold">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center text-sidebar-muted border border-sidebar-accent/50 overflow-hidden">
                <User className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white truncate w-32">{session?.companyName || 'Rahul Sharma'}</span>
                <span className="text-[10px] text-sidebar-muted uppercase font-black tracking-widest">{session?.role || 'Superadmin'}</span>
              </div>
            </div>
            <button onClick={() => window.location.href = '/merchant/settings'} className="text-sidebar-muted hover:text-white transition-colors">
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-500/10 transition-all uppercase tracking-widest"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      <header className="lg:hidden sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <span className="text-sm font-black italic tracking-tighter">B</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">BillZo</h1>
        </div>
        <div className="flex items-center gap-2">
           {!isOnline && <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
           <button className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-600 border border-gray-100">
             <Bell className="w-5 h-5" />
           </button>
        </div>
      </header>

      <main className="lg:pl-64 min-h-screen">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
          {children}
        </div>
      </main>

      <nav className="lg:hidden fixed bottom-6 left-4 right-4 z-50 bg-[#0B0E14] border border-[#1F2937] rounded-2xl shadow-2xl shadow-black/20 pb-safe">
        <div className="flex items-center justify-around p-1.5">
          {navItems.slice(0, 5).map((item) => {
            const isActive = pathname === item.href || (item.href !== '/merchant' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 min-w-[64px] py-2 rounded-xl transition-all ${
                  isActive ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500'
                }`}
              >
                <item.Icon className="w-5 h-5" />
                <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                  {item.label.split(' ')[0]}
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