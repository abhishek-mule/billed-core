'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, createContext, useContext } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/logo/Logo'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Home,
  Receipt,
  Users,
  Package,
  LogOut,
  Bell,
  Search,
  Plus,
  Settings as SettingsIcon,
  User,
  BarChart3,
  ScanLine,
  ShoppingBag,
  MoreHorizontal,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'

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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session && pathname !== '/start') {
    return null
  }

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

const navItems = [
  { href: '/merchant', label: 'Home', icon: Home },
  { href: '/merchant/pos', label: 'POS', icon: ScanLine, primary: true },
  { href: '/merchant/invoice', label: 'Bills', icon: Receipt },
  { href: '/merchant/products', label: 'Stock', icon: Package },
  { href: '/merchant/more', label: 'More', icon: MoreHorizontal },
]

const sidebarItems = [
  { href: '/merchant', label: 'Home', icon: Home },
  { href: '/merchant/pos', label: 'POS', icon: ScanLine },
  { href: '/merchant/invoice', label: 'Invoices', icon: Receipt },
  { href: '/merchant/purchases', label: 'Purchases', icon: ShoppingBag },
  { href: '/merchant/parties', label: 'Parties', icon: Users },
  { href: '/merchant/products', label: 'Products', icon: Package },
  { href: '/merchant/reports', label: 'Reports', icon: BarChart3 },
  { href: '/merchant/settings', label: 'Settings', icon: SettingsIcon },
]

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const session = useSession()
  const [isOnline, setIsOnline] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

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

  const [syncSummary, setSyncSummary] = useState({ synced: 0, pending: 0, failed: 0 })
  const [lastSync, setLastSync] = useState<string>('just now')

  useEffect(() => {
    async function fetchSyncStatus() {
      try {
        const res = await fetch('/api/merchant/stats')
        if (res.ok) {
          const data = await res.json()
          if (data.stats) {
            setSyncSummary({
              synced: data.stats.syncedCount || 0,
              pending: data.stats.pendingCount || 0,
              failed: data.stats.totalFailedCount || 0,
            })
          }
        }
      } catch (e) {
        console.error('Failed to fetch sync status')
      }
    }
    fetchSyncStatus()
    const interval = setInterval(fetchSyncStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/start'
  }

  const isMock = session?.erpMode === 'mock'
  const allSynced = syncSummary.pending === 0 && syncSummary.failed === 0

  return (
    <div className="flex min-h-screen w-full bg-slate-50">
      {/* Desktop Sidebar - Collapsible */}
      <aside className={`hidden lg:flex flex-col border-r border-slate-200 bg-white transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
        {/* Logo & Collapse Button */}
        <div className="px-4 py-5 border-b border-slate-200 flex items-center gap-3">
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          {!sidebarCollapsed && (
            <Link href="/merchant" className="flex items-center gap-2">
              <Logo variant="mark" />
              <Logo variant="text" />
            </Link>
          )}
          {sidebarCollapsed && (
            <Link href="/merchant" className="mx-auto">
              <Logo variant="mark" />
            </Link>
          )}
        </div>
        
        {/* Navigation Icons Only When Collapsed */}
        <nav className="flex-1 p-3 space-y-1">
          {sidebarItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/merchant' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href || '/'}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all ${
                  active
                    ? 'bg-teal-50 text-teal-700'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
                title={sidebarCollapsed ? label : undefined}
              >
                <Icon className={`h-5 w-5 flex-shrink-0 ${active ? 'text-teal-600' : 'text-slate-400'}`} />
                {!sidebarCollapsed && <span>{label}</span>}
              </Link>
            )
          })}
        </nav>
        
        {/* Sync Status */}
        <div className="p-4 border-t border-slate-200">
          {!sidebarCollapsed ? (
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className={`h-2 w-2 rounded-full ${allSynced ? 'bg-teal-500' : syncSummary.failed > 0 ? 'bg-red-500' : 'bg-amber-500'} animate-pulse-dot`} />
                {allSynced 
                  ? 'All synced' 
                  : syncSummary.failed > 0 
                    ? `${syncSummary.failed} failed`
                    : `${syncSummary.pending} pending`
                }
              </div>
              <p className="mt-1 text-xs text-slate-400">Last: {lastSync}</p>
            </div>
          ) : (
            <div className={`h-2 w-2 rounded-full mx-auto ${allSynced ? 'bg-teal-500' : syncSummary.failed > 0 ? 'bg-red-500' : 'bg-amber-500'}`} />
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Top Bar */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 backdrop-blur px-4 h-14">
          <Link href="/merchant" className="flex items-center gap-2">
            <Logo variant="mark" />
            <span className="text-lg font-bold text-slate-800">BillZo</span>
          </Link>
          <div className="flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-600">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse-dot" />
            Online
          </div>
        </header>

        {/* Desktop Top Bar */}
        <header className="hidden lg:flex sticky top-0 z-30 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 backdrop-blur px-6 h-16">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link href="/merchant" className="flex items-center gap-2">
              <Logo variant="mark" />
            </Link>
            <h1 className="text-lg font-semibold text-slate-800 tracking-tight">
              {sidebarItems.find(item => pathname === item.href || (item.href !== '/merchant' && pathname.startsWith(item.href)))?.label || 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                placeholder="Search invoices, products, parties..."
                className="h-9 w-72 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-300"
              />
            </div>
            <button className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 hover:bg-slate-50">
              <Bell className="h-4 w-4 text-slate-500" />
            </button>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-teal-500 to-teal-600 text-white text-sm font-semibold">
              {session?.companyName?.charAt(0) || 'R'}
            </div>
          </div>
        </header>

        {/* Demo Mode Banner */}
        <AnimatePresence>
          {isMock && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }} 
              animate={{ height: 'auto', opacity: 1 }}
              className="bg-amber-400 text-amber-900 text-[10px] font-black uppercase tracking-[0.2em] py-2 text-center flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-3 h-3" />
              Demo Mode — Data not saved to real accounting system
            </motion.div>
          )}
        </AnimatePresence>

        <main className="flex-1 pb-24 lg:pb-8 animate-fade-in">{children}</main>

        {/* Mobile Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden">
          <div className="grid grid-cols-5 px-2 pb-[env(safe-area-inset-bottom)]">
            {navItems.map(({ href, label, icon: Icon, primary }) => {
              const isActive = pathname === href || (href !== '/merchant' && pathname.startsWith(href))
              return (
                <Link
                  key={href}
                  href={href || '/'}
                  className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-base ${
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {primary ? (
                    <span className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow">
                      <Icon className="h-6 w-6" />
                    </span>
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                  <span className={primary ? 'mt-0.5' : ''}>{label}</span>
                </Link>
              )
            })}
          </div>
        </nav>
      </div>
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