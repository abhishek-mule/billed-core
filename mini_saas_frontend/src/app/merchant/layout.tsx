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
import { motion, AnimatePresence } from 'framer-motion'

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
  const allSynced = true

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="px-6 py-5 border-b border-sidebar-border">
          <Link href="/merchant" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center text-primary-foreground shadow-lg">
              <span className="text-xl font-black italic tracking-tighter">B</span>
            </div>
            <span className="text-2xl font-bold text-sidebar-foreground tracking-tight">BillZo</span>
          </Link>
        </div>
        
        <nav className="flex-1 p-3 space-y-1">
          {sidebarItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/merchant' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href || '/'}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-base ${
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          })}
        </nav>
        
        <div className="p-4 border-t border-sidebar-border">
          <div className="rounded-lg bg-sidebar-accent/50 p-3">
            <div className="flex items-center gap-2 text-xs text-sidebar-foreground/70">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse-dot" />
              {allSynced ? 'All synced' : 'Pending sync'}
            </div>
            <p className="mt-1 text-xs text-sidebar-foreground/60">Last: just now</p>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Top Bar */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card/95 backdrop-blur px-4 h-14">
          <Link href="/merchant" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
              <span className="text-sm font-black italic tracking-tighter">B</span>
            </div>
            <span className="text-lg font-bold text-foreground tracking-tight">BillZo</span>
          </Link>
          <div className="flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" />
            Online
          </div>
        </header>

        {/* Desktop Top Bar */}
        <header className="hidden lg:flex sticky top-0 z-30 items-center justify-between gap-4 border-b border-border bg-card/95 backdrop-blur px-8 h-16">
          <h1 className="text-xl font-semibold tracking-tight">
            {sidebarItems.find(item => pathname === item.href || (item.href !== '/merchant' && pathname.startsWith(item.href)))?.label || 'Dashboard'}
          </h1>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                placeholder="Search invoices, products, parties..."
                className="h-9 w-80 rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button className="grid h-9 w-9 place-items-center rounded-lg border border-input hover:bg-accent">
              <Bell className="h-4 w-4" />
            </button>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-primary text-primary-foreground text-sm font-semibold">
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
              className="bg-warning text-white text-[10px] font-black uppercase tracking-[0.2em] py-2 text-center flex items-center justify-center gap-2"
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