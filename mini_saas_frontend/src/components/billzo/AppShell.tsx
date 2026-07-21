'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  Bell, Search, Home, Plus, Receipt, TrendingUp, Activity,
  Users, Package, BarChart3, Settings, Menu,
  LogOut, ChevronDown, WifiOff, Zap, CreditCard, Target,
} from 'lucide-react'
import { Button } from './Button'
import { cn } from '@/lib/utils'
import { getDiceBearAvatarUrl } from './Avatar'
import '@/styles/app-shell.css'

// ─── Nav config ──────────────────────────────────────────────────────────────

const NAV_WORKSPACE = [
  { href: '/recovery', label: 'Recovery',  icon: Zap         },
  { href: '/dashboard',      label: 'Dashboard', icon: Home        },
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
  ;['accessToken', 'refreshToken', 'tokenExpiry'].forEach(k => localStorage.removeItem(k))
  window.location.href = '/auth'
}

function initials(name?: string) {
  if (!name) return 'BZ'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
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
  pathname, onLogout, userName,
}: {
  pathname: string
  onLogout: () => void
  userName?: string
}) {
  const ini = initials(userName)

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
          <img src={getDiceBearAvatarUrl(userName || 'BillZo', 'shapes')} alt="" className="w-8 h-8 rounded-full shrink-0 bg-muted/20" />
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
  title, onMobileMenu, onLogout, userName,
}: {
  title?: string
  onMobileMenu: () => void
  onLogout: () => void
  userName?: string
}) {
  return (
    <header className="bz-topbar">
      <div className="bz-topbar-left">
        <button className="bz-mobile-menu-btn lg:hidden" onClick={onMobileMenu} aria-label="Open menu">
          <Menu size={18} />
        </button>
        {title && <h1 className="bz-page-title">{title}</h1>}
      </div>

      <div className="bz-topbar-right">
        <label className="bz-search" aria-label="Search">
          <Search size={13} className="bz-search-icon" aria-hidden="true" />
          <input className="bz-search-input" placeholder="Search…" aria-label="Search invoices, parties, products" />
          <kbd className="bz-search-kbd" aria-hidden="true">⌘K</kbd>
        </label>

        <Link href="/pulse" className="bz-icon-btn" aria-label="Notifications">
          <Bell size={16} />
        </Link>

        <button className="bz-org-btn" onClick={onLogout} aria-label="Sign out">
          <img src={getDiceBearAvatarUrl(userName || 'BillZo', 'shapes')} alt="" className="w-7 h-7 rounded-full shrink-0 bg-muted/20" />
          <span className="bz-org-name hidden sm:block">{userName || 'BillZo'}</span>
          <ChevronDown size={12} className="bz-chevron hidden sm:block" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}

// ─── Mobile drawer ────────────────────────────────────────────────────────────

function MobileDrawer({
  open, onClose, onLogout, pathname, userName,
}: {
  open: boolean
  onClose: () => void
  onLogout: () => void
  pathname: string
  userName?: string
}) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const allNav = [...NAV_WORKSPACE, ...NAV_MANAGE, ...NAV_SYSTEM]
  const ini = initials(userName)

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
            <img src={getDiceBearAvatarUrl(userName || 'BillZo', 'shapes')} alt="" className="w-8 h-8 rounded-full shrink-0 bg-muted/20" />
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
        const active = pathname.startsWith(href)
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

// ─── Logout modal ─────────────────────────────────────────────────────────────

function LogoutModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="bz-modal-backdrop" onClick={onCancel} role="dialog" aria-modal="true" aria-labelledby="logout-title">
      <div className="bz-modal" onClick={e => e.stopPropagation()}>
        <h2 id="logout-title" className="bz-modal-title">Sign out?</h2>
        <p className="bz-modal-body">Your local data stays on this device. You can sign back in anytime.</p>
        <div className="bz-modal-actions">
          <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
          <Button variant="danger"  onClick={onConfirm} className="flex-1">Sign out</Button>
        </div>
      </div>
    </div>
  )
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export function AppShell({ children, title }: { children: React.ReactNode; title?: string }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen]   = useState(false)
  const [isOnline, setIsOnline]       = useState(true)
  const [showLogout, setShowLogout]   = useState(false)
  const [userName, setUserName]       = useState<string>()

  useEffect(() => { setMobileOpen(false) }, [pathname])

  useEffect(() => {
    setIsOnline(navigator.onLine)

    const goOnline = () => { setIsOnline(true); import('@/lib/billzo/sync').then(m => m.scheduleBackgroundSync()) }
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    const name = getCookie('bz_tenant_name')
    setUserName(name ? decodeURIComponent(name) : undefined)

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
        <Sidebar pathname={pathname} onLogout={() => setShowLogout(true)} userName={userName} />
        <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} onLogout={() => setShowLogout(true)} pathname={pathname} userName={userName} />

        <div className="bz-body">
          <TopBar title={title} onMobileMenu={() => setMobileOpen(true)} onLogout={() => setShowLogout(true)} userName={userName} />

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

      {showLogout && <LogoutModal onCancel={() => setShowLogout(false)} onConfirm={() => { setShowLogout(false); doLogout() }} />}
    </>
  )
}

export default AppShell
