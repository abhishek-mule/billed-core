'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  Bell, Search, Home, Plus, Receipt, TrendingUp, Activity,
  Users, Package, BarChart3, Settings, Menu,
  LogOut, ChevronDown, WifiOff, Zap, CreditCard, Target,
} from 'lucide-react'
import { ProfileMenu } from './ProfileMenu'
import { Button } from './Button'
import { BrandAvatar } from './Avatar'
import { db } from '@/lib/billzo/db'
import { cn } from '@/lib/utils'
import '@/styles/app-shell.css'
import { resolveQuickNav } from '@/lib/billzo/app-shell-search'

// ─── Nav config ──────────────────────────────────────────────────────────────

const NAV_WORKSPACE = [
  { href: '/recovery', label: 'Recovery',  icon: Zap         },
  { href: '/dashboard',      label: 'Home',      icon: Home        },
  { href: '/invoices',       label: 'Invoices',  icon: Receipt     },
  { href: '/parties',        label: 'Customers', icon: Users       },
  { href: '/pulse',          label: 'Payments',  icon: Activity    },
  { href: '/cashflow',       label: 'Cashflow',  icon: TrendingUp  },
]

const NAV_MANAGE = [
  { href: '/products', label: 'Products', icon: Package  },
  { href: '/reports',  label: 'Reports',  icon: BarChart3 },
]

const NAV_SYSTEM = [
  { href: '/settings', label: 'Settings', icon: Settings },
]

const MOBILE_NAV = [
  { href: '/recovery',  label: 'Recovery',  icon: Zap,          primary: false },
  { href: '/dashboard', label: 'Home',      icon: Home,         primary: false },
  { href: '/pos',       label: 'Bill',      icon: Plus,         primary: true  },
  { href: '/parties',   label: 'Customers', icon: Users,        primary: false },
  { href: '/recovery/timeline', label: 'Activity', icon: Activity, primary: false },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCookie(name: string) {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

function doLogout() {
  ;['bz_access', 'bz_refresh', 'bz_tenant', 'bz_tenant_name', 'bz_user_id'].forEach(
    k => (document.cookie = `${k}=; Max-Age=0; path=/`)
  )
  ;['accessToken', 'refreshToken', 'tokenExpiry', 'tenantLogo'].forEach(k => localStorage.removeItem(k))
  window.location.href = '/auth'
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function NavSection({
  label, items, pathname,
}: {
  label: string
  items: { href: string; label: string; icon: React.ElementType }[]
  pathname: string
}) {
  return (
    <div className="bz-nav-section">
      <span className="bz-nav-section-label">{label}</span>
      {items.map(({ href, label, icon: Icon }, idx) => {
        const active = pathname.startsWith(href)
        const isRecovery = label === 'Recovery'
        return (
          <Link
            key={href}
            href={href}
            className={cn('bz-nav-item', active && 'bz-nav-item--active', isRecovery && 'bz-nav-item--accent')}
            aria-current={active ? 'page' : undefined}
            style={{ '--i': idx } as React.CSSProperties}
          >
            <Icon size={16} strokeWidth={1.75} className="bz-nav-icon" />
            <span className="bz-nav-label">{label}</span>
          </Link>
        )
      })}
    </div>
  )
}

function Sidebar({
  pathname, onLogout, userName, logo,
}: {
  pathname: string
  onLogout: () => void
  userName?: string
  logo?: string | null
}) {
  return (
    <aside className="bz-sidebar">
      <div className="bz-sidebar-header">
        <Link href="/dashboard" className="bz-logo" aria-label="BillZo home">
          <img src="/logo.svg" alt="BillZo" className="bz-logo-img" />
          <span className="bz-logo-text">BillZo</span>
        </Link>
      </div>

      <nav className="bz-sidebar-nav">
        <NavSection label="Workspace" items={NAV_WORKSPACE} pathname={pathname} />
        <NavSection label="Manage"    items={NAV_MANAGE}    pathname={pathname} />
        <NavSection label="System"    items={NAV_SYSTEM}    pathname={pathname} />
      </nav>

      <div className="bz-sidebar-footer">
        <button className="bz-user-row" onClick={onLogout} title="Sign out">
          <BrandAvatar name={userName || 'My Shop'} logo={logo} className="w-8 h-8" size={32} />
          <div className="bz-user-info">
            <span className="bz-user-name">{userName || 'My Shop'}</span>
          </div>
          <LogOut size={13} className="bz-logout-icon" />
        </button>
      </div>
    </aside>
  )
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

function TopBar({
  title, onMobileMenu, onLogout, userName, logo,
}: {
  title?: string
  onMobileMenu: () => void
  onLogout: () => void
  userName?: string
  logo?: string | null
}) {
  const [query, setQuery] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const router = useRouter()

  const handleSearch = (value: string) => {
    setQuery(value)
    const target = resolveQuickNav(value)
    if (!target) {
      setHint(value.trim() ? 'Try terms like invoice, customer, recovery, or settings' : null)
      return
    }
    setHint(`Jump to ${target}`)
  }

  const goToSearch = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    const target = resolveQuickNav(query)
    if (target) {
      router.push(target)
      setHint(null)
    }
  }

  return (
    <header className="bz-topbar">
      <div className="bz-topbar-left">
        <button className="bz-mobile-menu-btn lg:hidden" onClick={onMobileMenu} aria-label="Open menu">
          <Menu size={18} />
        </button>
        {title && <h1 className="bz-page-title">{title}</h1>}
      </div>

      <div className="bz-topbar-right">
        <div className="bz-search" aria-label="Quick navigation">
          <Search size={13} className="bz-search-icon" aria-hidden="true" />
          <input
            className="bz-search-input"
            placeholder="Search…"
            aria-label="Search invoices, parties, products"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={goToSearch}
          />
          <kbd className="bz-search-kbd" aria-hidden="true">↵</kbd>
          {hint && <span className="bz-search-hint">{hint}</span>}
        </div>

        <Link href="/pulse" className="bz-icon-btn" aria-label="Notifications">
          <Bell size={16} />
        </Link>

        <button className="bz-org-btn" onClick={onLogout} aria-label="Sign out">
          <BrandAvatar name={userName || 'My Shop'} logo={logo} className="w-7 h-7" size={28} />
          <span className="bz-org-name hidden sm:block">{userName || 'My Shop'}</span>
          <ChevronDown size={12} className="bz-chevron hidden sm:block" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}

// ─── Mobile drawer ────────────────────────────────────────────────────────────

function MobileDrawer({
  open, onClose, onLogout, pathname, userName, logo,
}: {
  open: boolean
  onClose: () => void
  onLogout: () => void
  pathname: string
  userName?: string
  logo?: string | null
}) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const allNav = [...NAV_WORKSPACE, ...NAV_MANAGE, ...NAV_SYSTEM]

  return (
    <>
      <div className={cn('bz-drawer-backdrop', open && 'bz-drawer-backdrop--open')} onClick={onClose} aria-hidden="true" />
      <div className={cn('bz-drawer', open && 'bz-drawer--open')} role="dialog" aria-modal="true" aria-label="Navigation menu">
        <div className="bz-drawer-header">
          <Link href="/dashboard" className="bz-logo" onClick={onClose}>
            <img src="/icon.svg" alt="BillZo" className="bz-logo-img" />
            <span className="bz-logo-text">BillZo</span>
          </Link>
          <button className="bz-icon-btn" onClick={onClose} aria-label="Close menu" style={{ border: 'none' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="bz-drawer-nav">
          {allNav.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn('bz-nav-item', active && 'bz-nav-item--active')}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={16} strokeWidth={1.75} className="bz-nav-icon" />
                <span className="bz-nav-label">{label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="bz-drawer-footer">
          <button className="bz-user-row" onClick={onLogout} style={{ width: '100%', textAlign: 'left' }}>
            <BrandAvatar name={userName || 'My Shop'} logo={logo} className="w-8 h-8" size={32} />
            <div className="bz-user-info">
              <span className="bz-user-name">{userName || 'My Shop'}</span>
            </div>
            <LogOut size={13} className="bz-logout-icon" />
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Bottom nav (mobile) ──────────────────────────────────────────────────────

function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav className="bz-bottom-nav" aria-label="Main navigation">
      {MOBILE_NAV.map(({ href, label, icon: Icon, primary }) => {
        const active = pathname === href
        if (primary) {
          return (
            <Link
              key={href}
              href={href}
              className="bz-bottom-item bz-bottom-item--primary"
              aria-current={active ? 'page' : undefined}
            >
              <span className="bz-bottom-fab" aria-hidden="true"><Icon size={26} strokeWidth={2.25} /></span>
              <span>{label}</span>
            </Link>
          )
        }
        return (
          <Link
            key={href}
            href={href}
            className={cn('bz-bottom-item', active && 'bz-bottom-item--active')}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={22} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export function AppShell({ children, title }: { children: React.ReactNode; title?: string }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen]   = useState(false)
  const [isOnline, setIsOnline]       = useState(true)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [userName, setUserName]       = useState<string>()
  const [tenantLogo, setTenantLogo]   = useState<string | null>(null)

  useEffect(() => { setMobileOpen(false) }, [pathname])

  useEffect(() => {
    setIsOnline(navigator.onLine)

    const goOnline = () => { setIsOnline(true); import('@/lib/billzo/sync').then(m => m.scheduleBackgroundSync()) }
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    const name = getCookie('bz_tenant_name')
    setUserName(name ? decodeURIComponent(name) : undefined)

    const tid = getCookie('bz_tenant')
    if (tid) {
      const cached = typeof window !== 'undefined' ? window.localStorage.getItem('tenantLogo') : null
      if (cached) setTenantLogo(cached)
      db().tenants.get(tid).then(t => {
        if (t?.logo) {
          setTenantLogo(t.logo)
          window.localStorage.setItem('tenantLogo', t.logo)
        }
      }).catch(() => {})
    }

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Silent token refresh
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    function scheduleRefresh() {
      try {
        const token = document.cookie.match(/(?:^|;\s*)bz_access=([^;]+)/)?.[1]
        if (!token) return
        const { exp } = JSON.parse(atob(token.split('.')[1]))
        const refreshIn = (exp - Math.floor(Date.now() / 1000) - 300) * 1000
        if (refreshIn <= 0) return
        timer = setTimeout(async () => {
          try {
            const refreshTok = document.cookie.match(/(?:^|;\s*)bz_refresh=([^;]+)/)?.[1]
            if (!refreshTok) return
            await fetch('/api/auth/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken: refreshTok }),
            })
          } catch { /* silent */ }
        }, refreshIn)
      } catch { /* silent */ }
    }
    scheduleRefresh()
    return () => { if (timer) clearTimeout(timer) }
  }, [])

  return (
    <>
      <div className="bz-shell">
        <Sidebar pathname={pathname} onLogout={() => setShowProfileMenu(true)} userName={userName} logo={tenantLogo} />
        <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} onLogout={() => setShowProfileMenu(true)} pathname={pathname} userName={userName} logo={tenantLogo} />

        <div className="bz-body">
          <TopBar title={title} onMobileMenu={() => setMobileOpen(true)} onLogout={() => setShowProfileMenu(true)} userName={userName} logo={tenantLogo} />

          {!isOnline && (
            <div className="bz-offline-bar" role="status">
              <WifiOff size={13} aria-hidden="true" />
              Offline — changes will sync when reconnected
            </div>
          )}

          <main className="bz-main">{children}</main>
          <BottomNav pathname={pathname} />
        </div>
      </div>

      {showProfileMenu && <ProfileMenu onClose={() => setShowProfileMenu(false)} onLogout={() => { setShowProfileMenu(false); doLogout() }} />}
    </>
  )
}

export default AppShell
