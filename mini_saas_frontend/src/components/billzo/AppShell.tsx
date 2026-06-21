'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import {
  Bell, Search, Home, ShoppingCart, Receipt, TrendingUp, Activity,
  Users, Package, Settings,
  MoreHorizontal, Menu, LogOut, PanelLeftClose, PanelLeft,
  User, HelpCircle, Clock, MessageSquare,
} from 'lucide-react'
import { Button } from './Button'
import { cn } from '@/lib/utils'

const NAV_WORKSPACE = [
  { href: '/dashboard', label: 'Home',       icon: Home        },
  { href: '/cashflow',  label: 'Cashflow',   icon: TrendingUp  },
  { href: '/pulse',     label: 'Payments',   icon: Activity    },
  { href: '/invoices',  label: 'Invoices',   icon: Receipt     },
  { href: '/pos',       label: 'POS',        icon: ShoppingCart },
]

const NAV_MANAGE = [
  { href: '/parties',   label: 'Parties',  icon: Users       },
  { href: '/products',  label: 'Products', icon: Package     },
]

const NAV_RECOVERY = [
  { href: '/recovery/queue',   label: 'Recovery Queue',   icon: Clock        },
  { href: '/recovery/history', label: 'Recovery History', icon: MessageSquare },
]

const NAV_SYSTEM = [
  { href: '/settings', label: 'Settings', icon: Settings    },
]

const MODULE_NAMES: Record<string, string> = {
  '/dashboard': 'Home',
  '/cashflow': 'Cashflow',
  '/pulse': 'Payments',
  '/invoices': 'Invoices',
  '/pos': 'POS',
  '/parties': 'Parties',
  '/products': 'Products',
  '/reports': 'Reports',
  '/recovery': 'Recovery',
  '/settings': 'Settings',
  '/more': 'More',
}

const MOBILE_NAV = [
  { href: '/dashboard', label: 'Home',     icon: Home,           primary: false },
  { href: '/cashflow',  label: 'Cashflow', icon: TrendingUp,     primary: false },
  { href: '/pos',       label: 'POS',      icon: ShoppingCart,   primary: true  },
  { href: '/invoices',  label: 'Invoices', icon: Receipt,        primary: false },
  { href: '/parties',   label: 'Parties',  icon: Users,          primary: false },
  { href: '/more',      label: 'More',     icon: MoreHorizontal, primary: false },
]

function getCookie(name: string) {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

function doLogout() {
  ;['bz_access', 'bz_refresh', 'bz_tenant', 'bz_tenant_name', 'bz_user_id'].forEach(c =>
    document.cookie = c + '=; Max-Age=0; path=/'
  )
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('tokenExpiry')
  window.location.href = '/auth'
}

function Sidebar({
  pathname,
  collapsed,
  onToggle,
  onLogout,
  userName,
  userEmail,
}: {
  pathname: string
  collapsed: boolean
  onToggle: () => void
  onLogout: () => void
  userName?: string
  userEmail?: string
}) {
  return (
    <aside
      className={cn(
        'w-sidebar flex-shrink-0 hidden lg:flex flex-col bg-card border-r border-border transition-[width] duration-200 overflow-hidden',
        collapsed && 'w-sidebar-collapsed',
      )}
    >
      {/* Header */}
      <div className="h-topbar flex items-center gap-3.5 px-3.5 border-b border-border flex-shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0 no-underline text-inherit" aria-label="BillZo">
          <img src="/logo_new.png" alt="BillZo" className="w-[26px] h-[26px] object-contain shrink-0" />
          {!collapsed && <span className="text-sm font-semibold tracking-tight whitespace-nowrap">BillZo</span>}
        </Link>
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex items-center gap-2 h-8 rounded text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer whitespace-nowrap',
            collapsed ? 'w-full justify-center' : 'ml-auto',
          )}
        >
          {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 scrollbar-none">
        {[
          { label: 'Workspace', items: NAV_WORKSPACE },
          { label: 'Manage', items: NAV_MANAGE },
          { label: 'Recovery', items: NAV_RECOVERY },
          { label: 'System', items: NAV_SYSTEM },
        ].map((section, si) => (
          <div key={section.label} className={cn(si > 0 && 'mt-2 pt-2 border-t border-border')}>
            {!collapsed && (
              <span className="text-[10.5px] font-semibold tracking-widest uppercase px-2 py-1.5 text-muted-foreground whitespace-nowrap block">
                {section.label}
              </span>
            )}
            {section.items.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-2 h-[34px] px-2 rounded text-xs font-medium text-muted-foreground no-underline whitespace-nowrap transition-colors hover:bg-secondary hover:text-foreground',
                    active && 'bg-primary/10 text-primary font-semibold',
                    collapsed && 'justify-center px-0',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={18} strokeWidth={collapsed ? 2 : 1.8} className="shrink-0" />
                  {!collapsed && <span className="overflow-hidden text-ellipsis">{label}</span>}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-border p-2 flex flex-col gap-0.5">
        <button
          onClick={onLogout}
          className={cn(
            'flex items-center gap-2 w-full p-1.5 px-2 rounded text-left hover:bg-secondary transition-colors whitespace-nowrap cursor-pointer',
            collapsed && 'justify-center',
          )}
          title="Sign out"
        >
          <div className="w-[26px] h-[26px] rounded shrink-0 overflow-hidden bg-primary/10 flex items-center justify-center text-xs font-bold text-primary border border-border">
            <img
              src={`https://api.dicebear.com/10.x/glyphs/svg?seed=${encodeURIComponent(userName || 'default')}`}
              alt="avatar"
              className="w-full h-full"
            />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0 overflow-hidden">
              <span className="text-xs font-semibold truncate block">{userName || 'My Shop'}</span>
              <span className="text-[11px] text-muted-foreground truncate block">{userEmail || 'Sign out'}</span>
            </div>
          )}
          {!collapsed && <LogOut size={14} className="shrink-0 text-muted-foreground" />}
        </button>
      </div>
    </aside>
  )
}

function TopBar({
  onMobileMenu,
  userName,
  onLogout,
}: {
  onMobileMenu: () => void
  userName?: string
  onLogout: () => void
}) {
  const pathname = usePathname()
  const title = Object.entries(MODULE_NAMES).find(([path]) => pathname.startsWith(path))?.[1] || ''
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showDropdown) return
    const clickHandler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDropdown(false)
    }
    document.addEventListener('mousedown', clickHandler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', clickHandler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [showDropdown])

  return (
    <header className="h-topbar flex-shrink-0 flex items-center gap-2 px-4 bg-card border-b border-border">
      <div className="flex items-center gap-2.5 min-w-0 lg:hidden">
        <button
          onClick={onMobileMenu}
          aria-label="Open menu"
          className="flex items-center justify-center w-8 h-8 rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <Menu size={16} />
        </button>
      </div>
      <h1 className="text-sm font-semibold truncate m-0">{title}</h1>

      <div className="ml-auto flex items-center gap-1.5">
        <div className="flex items-center gap-[7px] h-8 px-2.5 bg-secondary border border-border rounded-md cursor-text transition-colors focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15 min-w-0">
          <Search size={14} className="shrink-0 text-muted-foreground" />
          <input
            className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            placeholder="Search\u2026"
            aria-label="Search invoices, parties, products"
          />
          <kbd className="hidden sm:block text-[10.5px] font-mono text-muted-foreground bg-card border border-border px-1 rounded">⌘K</kbd>
        </div>

        <Link
          href="/pulse"
          className="flex items-center justify-center w-8 h-8 border border-border rounded-md bg-card text-muted-foreground hover:bg-secondary hover:text-foreground shrink-0 no-scale"
          aria-label="View payments"
        >
          <Bell size={16} />
        </Link>

        <div className="relative">
          <button
            onClick={() => setShowDropdown(v => !v)}
            aria-label="Profile menu"
            aria-expanded={showDropdown}
            className="w-[22px] h-[22px] rounded overflow-hidden shrink-0 ring-offset-2 ring-offset-card focus-visible:ring-2 focus-visible:ring-ring"
          >
            <img
              src={`https://api.dicebear.com/10.x/glyphs/svg?seed=${encodeURIComponent(userName || 'default')}`}
              alt="avatar"
              className="w-full h-full"
            />
          </button>

          {showDropdown && (
            <>
              <div className="fixed inset-0 z-[90] bg-transparent" onClick={() => setShowDropdown(false)} />
              <div
                className="absolute top-[44px] right-0 z-[95] min-w-[180px] bg-card border border-border rounded-xl p-1 shadow-drawer dark:shadow-drawer-dark animate-fade-scale-in"
                ref={dropdownRef}
                role="menu"
              >
                <Link
                  href="/settings"
                  className="flex items-center gap-2 w-full px-2.5 py-[7px] rounded text-xs font-medium no-underline text-foreground hover:bg-secondary transition-colors"
                  role="menuitem"
                  onClick={() => setShowDropdown(false)}
                >
                  <User size={14} className="text-muted-foreground shrink-0" />
                  Settings
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-2 w-full px-2.5 py-[7px] rounded text-xs font-medium no-underline text-foreground hover:bg-secondary transition-colors"
                  role="menuitem"
                  onClick={() => setShowDropdown(false)}
                >
                  <HelpCircle size={14} className="text-muted-foreground shrink-0" />
                  Help & Support
                </Link>
                <div className="h-px bg-border my-[3px] mx-1.5" />
                <button
                  className="flex items-center gap-2 w-full px-2.5 py-[7px] rounded text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                  role="menuitem"
                  onClick={() => { setShowDropdown(false); onLogout() }}
                >
                  <LogOut size={14} className="shrink-0" />
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function MobileDrawer({
  open,
  onClose,
  pathname,
}: {
  open: boolean
  onClose: () => void
  pathname: string
}) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const allNav = [...NAV_WORKSPACE, ...NAV_MANAGE, ...NAV_RECOVERY, ...NAV_SYSTEM]

  return (
    <div
      className={cn(
        'fixed inset-0 bg-black/35 opacity-0 pointer-events-none transition-opacity z-40',
        open && 'opacity-100 pointer-events-auto',
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          'fixed top-0 left-0 bottom-0 w-[260px] bg-card border-r border-border flex flex-col -translate-x-full transition-transform duration-300 z-50 will-change-transform',
          open && 'translate-x-0',
        )}
        onClick={e => e.stopPropagation()}
      >
        <div className="h-topbar flex items-center justify-between px-3.5 border-b border-border flex-shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0 no-underline text-inherit" onClick={onClose}>
            <img src="/logo_new.png" alt="BillZo" className="w-[26px] h-[26px] object-contain shrink-0" />
            <span className="text-sm font-semibold tracking-tight">BillZo</span>
          </Link>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="flex items-center justify-center w-8 h-8 text-muted-foreground hover:bg-secondary hover:text-foreground rounded-md transition-colors no-scale"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2.5 flex flex-col gap-0.5 scrollbar-none">
          {allNav.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-2.5 h-[38px] px-2.5 rounded text-sm font-medium text-muted-foreground no-underline transition-colors hover:bg-secondary hover:text-foreground',
                  active && 'bg-primary/10 text-primary font-semibold',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={16} strokeWidth={1.8} />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="flex-shrink-0 border-t border-border p-3 px-2.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            All synced \u00b7 just now
          </span>
        </div>
      </div>
    </div>
  )
}

function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav className="flex items-stretch h-bottom-nav bg-card border-t border-border pb-safe flex-shrink-0 lg:hidden">
      {MOBILE_NAV.map(({ href, label, icon: Icon, primary }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-[3px] text-[11px] font-medium text-muted-foreground no-underline py-1 relative transition-colors',
              active && 'text-primary',
              primary && 'text-primary',
            )}
            aria-current={active ? 'page' : undefined}
          >
            {primary
              ? (
                <span className="w-11 h-11 rounded-xl bg-primary text-white shadow-lg shadow-primary/25 flex items-center justify-center">
                  <Icon size={20} strokeWidth={2} />
                </span>
              )
              : <Icon size={18} strokeWidth={1.8} />
            }
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function AppShell({
  children,
  title,
}: {
  children: React.ReactNode
  title?: string
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [userData, setUserData] = useState<{ userName?: string; userEmail?: string }>({})

  useEffect(() => { setMobileOpen(false) }, [pathname])

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const goOnline = () => {
      setIsOnline(true)
      import('@/lib/billzo/sync').then(m => m.scheduleBackgroundSync())
    }
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    function readUserData() {
      const name = getCookie('bz_tenant_name')
      let email: string | undefined
      try {
        const token = getCookie('bz_access')
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]))
          email = payload.email
        }
      } catch {}
      setUserData({
        userName: name ? decodeURIComponent(name) : undefined,
        userEmail: email,
      })
    }

    readUserData()
    window.addEventListener('focus', readUserData)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('focus', readUserData)
    }
  }, [])

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null

    function scheduleRefresh() {
      try {
        const token = document.cookie.match(/(?:^|;\s*)bz_access=([^;]+)/)?.[1]
        if (!token) return
        const payload = JSON.parse(atob(token.split('.')[1]))
        const exp = payload.exp
        const now = Math.floor(Date.now() / 1000)
        const ttl = exp - now
        const refreshAt = ttl > 0 ? (ttl - 300) * 1000 : 0
        if (timeout) clearTimeout(timeout)
        if (refreshAt > 0) {
          timeout = setTimeout(async () => {
            try {
              const refreshTok = document.cookie.match(/(?:^|;\s*)bz_refresh=([^;]+)/)?.[1]
              if (!refreshTok) return
              const res = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: refreshTok }),
              })
              if (res.ok) {
                const setCookie = res.headers.get('set-cookie') || ''
                document.cookie = setCookie
              }
            } catch { /* silent */ }
          }, refreshAt)
        }
      } catch { /* silent */ }
    }

    scheduleRefresh()
    return () => { if (timeout) clearTimeout(timeout) }
  }, [])

  const { userName, userEmail } = userData

  return (
    <>
      <div className="flex h-dvh bg-background overflow-hidden">
        <Sidebar
          pathname={pathname}
          collapsed={collapsed}
          onToggle={() => setCollapsed(c => !c)}
          onLogout={() => setShowLogoutConfirm(true)}
          userName={userName}
          userEmail={userEmail}
        />

        <MobileDrawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          pathname={pathname}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar
            onMobileMenu={() => setMobileOpen(true)}
            userName={userName}
            onLogout={() => setShowLogoutConfirm(true)}
          />

          {!isOnline && (
            <div className="flex items-center justify-center gap-[7px] py-[7px] px-4 bg-destructive/10 text-destructive text-xs font-medium border-b border-destructive/20">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
              You are offline — changes will sync when reconnected
            </div>
          )}

          <main className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
            <div className="p-6 max-w-[1280px] mx-auto">{children}</div>
          </main>

          <BottomNav pathname={pathname} />
        </div>
      </div>

      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div className="w-full max-w-[360px] bg-card border border-border rounded-xl p-5 pt-5 pb-4 animate-fade-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold m-0 mb-1.5">Sign out of BillZo?</h3>
            <p className="text-xs text-muted-foreground leading-relaxed m-0 mb-[18px]">
              Your local data will remain on this device. You can sign back in anytime.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowLogoutConfirm(false)} className="flex-1">
                Cancel
              </Button>
              <Button variant="danger" onClick={() => { setShowLogoutConfirm(false); doLogout() }} className="flex-1">
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
