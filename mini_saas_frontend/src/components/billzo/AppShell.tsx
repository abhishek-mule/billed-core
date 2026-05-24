'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  Bell, Search, Home, ScanLine, Receipt,
  ShoppingBag, Users, Package, BarChart3, Settings,
  MoreHorizontal, Menu, LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import '@/styles/app-shell.css'

const NAV_WORKSPACE = [
  { href: '/dashboard', label: 'Home',      icon: Home        },
  { href: '/pos',       label: 'POS',       icon: ScanLine    },
  { href: '/invoices',  label: 'Invoices',  icon: Receipt     },
  { href: '/purchases', label: 'Purchases', icon: ShoppingBag },
  { href: '/parties',   label: 'Parties',   icon: Users       },
  { href: '/products',  label: 'Products',  icon: Package     },
]

const NAV_SYSTEM = [
  { href: '/reports',  label: 'Reports',  icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings  },
]

const MOBILE_NAV = [
  { href: '/dashboard', label: 'Home',  icon: Home,           primary: false },
  { href: '/invoices',  label: 'Bills', icon: Receipt,        primary: false },
  { href: '/pos',       label: 'POS',   icon: ScanLine,       primary: true  },
  { href: '/products',  label: 'Stock', icon: Package,        primary: false },
  { href: '/more',      label: 'More',  icon: MoreHorizontal, primary: false },
]

function getCookie(name: string) {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

function doLogout() {
  document.cookie = 'bz_access=; Max-Age=0; path=/'
  document.cookie = 'bz_refresh=; Max-Age=0; path=/'
  document.cookie = 'bz_tenant=; Max-Age=0; path=/'
  document.cookie = 'bz_tenant_name=; Max-Age=0; path=/'
  document.cookie = 'bz_user_id=; Max-Age=0; path=/'
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
    <aside className={cn('sidebar', collapsed && 'sidebar--collapsed')}>
      <div className="sidebar-header">
        <Link href="/dashboard" className="sidebar-logo" aria-label="BillZo">
          <img src="/logo_new.png" alt="BillZo" className="logo-img" />
          <span className="logo-text">BillZo</span>
        </Link>

        <button
          className={cn('ham-btn', collapsed && 'ham-btn--collapsed')}
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span /><span /><span />
        </button>
      </div>

      <nav className="sidebar-nav">
        <span className="nav-section-label">Workspace</span>

        {NAV_WORKSPACE.map(({ href, label, icon: Icon }, i) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              style={{ '--i': i } as React.CSSProperties}
              className={cn('nav-item', active && 'nav-item--active')}
            >
              <span className="nav-icon"><Icon size={15} strokeWidth={1.8} /></span>
              <span className="nav-label">{label}</span>
              <span className="nav-tooltip" aria-hidden="true">{label}</span>
            </Link>
          )
        })}

        <span className="nav-section-label nav-section-label--spaced">System</span>

        {NAV_SYSTEM.map(({ href, label, icon: Icon }, i) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              style={{ '--i': i + NAV_WORKSPACE.length } as React.CSSProperties}
              className={cn('nav-item', active && 'nav-item--active')}
            >
              <span className="nav-icon"><Icon size={15} strokeWidth={1.8} /></span>
              <span className="nav-label">{label}</span>
              <span className="nav-tooltip" aria-hidden="true">{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="user-row" onClick={onLogout} style={{ cursor: 'pointer' }}>
          <img
            src={`https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(userName || 'guest')}`}
            alt="Profile"
            className="user-avatar"
            onError={(e) => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(userName || 'guest')}&backgroundColor=bbf7d0` }}
          />
          <div className="user-info">
            <span className="user-name">{userName || 'My Shop'}</span>
            <span className="user-plan">{userEmail || 'Click to logout'}</span>
          </div>
          <LogOut size={14} className="text-muted-foreground ml-auto" />
        </div>
        <span className="nav-tooltip nav-tooltip--user" aria-hidden="true">{userName || 'My Shop'}</span>
      </div>
    </aside>
  )
}

function TopBar({
  title,
  onMobileMenu,
  userName,
}: {
  title?: string
  onMobileMenu: () => void
  userName?: string
}) {
  const [focused, setFocused] = useState(false)

  return (
    <header className="topbar">
      <div className="topbar-left lg-hidden">
        <button className="mobile-ham" onClick={onMobileMenu} aria-label="Open menu">
          <Menu size={16} />
        </button>
        <span className="topbar-title">{title || 'BillZo'}</span>
      </div>

      <span className="topbar-title desktop-only">{title || 'BillZo'}</span>

      <div className="topbar-right">
        <div className={cn('search-wrap', focused && 'search-wrap--focused')}>
          <Search size={13} className="search-icon" />
          <input
            className="search-input"
            placeholder="Search…"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          <kbd className="search-kbd">⌘K</kbd>
        </div>

        <button className="icon-btn" aria-label="Notifications" style={{ position: 'relative' }}>
          <Bell size={15} />
          <span className="notif-dot" />
        </button>

        <img
          src={`https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(userName || 'guest')}`}
          alt="Profile"
          className="topbar-avatar"
          onError={(e) => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(userName || 'guest')}&backgroundColor=bbf7d0` }}
        />
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

  const allNav = [...NAV_WORKSPACE, ...NAV_SYSTEM]

  return (
    <div
      className={cn('mobile-overlay', open && 'mobile-overlay--open')}
      onClick={onClose}
    >
      <div
        className={cn('mobile-drawer', open && 'mobile-drawer--open')}
        onClick={e => e.stopPropagation()}
      >
        <div className="mobile-drawer-header">
          <Link href="/dashboard" className="sidebar-logo" onClick={onClose}>
            <img src="/logo_new.png" alt="BillZo" className="logo-img" />
            <span className="logo-text">BillZo</span>
          </Link>
          <button className="icon-btn" onClick={onClose} aria-label="Close menu">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="mobile-drawer-nav">
          {allNav.map(({ href, label, icon: Icon }, i) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                style={{ '--di': i } as React.CSSProperties}
                className={cn('mobile-nav-item', active && 'mobile-nav-item--active')}
              >
                <span className="nav-icon"><Icon size={16} strokeWidth={1.8} /></span>
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="mobile-drawer-footer">
          <span className="sync-pill">
            <span className="sync-dot" />
            All synced · just now
          </span>
        </div>
      </div>
    </div>
  )
}

function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav className="bottom-nav lg-hidden">
      {MOBILE_NAV.map(({ href, label, icon: Icon, primary }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'bottom-item',
              active && 'bottom-item--active',
              primary && 'bottom-item--primary',
            )}
          >
            {primary
              ? <span className="bottom-fab"><Icon size={20} strokeWidth={2} /></span>
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

  useEffect(() => { setMobileOpen(false) }, [pathname])

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const { userName, userEmail } = (() => {
    const name = getCookie('bz_tenant_name')
    let email: string | undefined
    try {
      const token = getCookie('bz_access')
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]))
        email = payload.email
      }
    } catch {}
    return {
      userName: name ? decodeURIComponent(name) : undefined,
      userEmail: email,
    }
  })()

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    function scheduleRefresh() {
      try {
        const token = document.cookie.match(/(?:^|;\s*)bz_access=([^;]+)/)?.[1]
        if (!token) return

        const payload = JSON.parse(atob(token.split('.')[0]))
        const exp = payload.exp
        const now = Math.floor(Date.now() / 1000)
        const ttl = exp - now
        const refreshAt = ttl > 0 ? (ttl - 300) * 1000 : 0

        if (interval) clearInterval(interval)
        if (refreshAt > 0) {
          interval = setTimeout(async () => {
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
    return () => { if (interval) clearTimeout(interval) }
  }, [])

  return (
    <>
      <div className={cn('shell', collapsed && 'shell--collapsed')}>
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

        <div className="shell-body">
          <TopBar title={title} onMobileMenu={() => setMobileOpen(true)} userName={userName} />

          {!isOnline && (
            <div className="flex items-center justify-center gap-2 bg-destructive px-4 py-1.5 text-xs font-semibold text-destructive-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
              You are offline — changes will sync when reconnected
            </div>
          )}

          <main className="shell-main animate-fade-in">{children}</main>
          <BottomNav pathname={pathname} />
        </div>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => setShowLogoutConfirm(false)}>
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-card p-6 shadow-xl border border-border" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">Sign out of BillZo?</h3>
            <p className="mt-1 text-sm text-muted-foreground">Your local data will remain on this device. You can sign back in anytime.</p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 rounded-xl border border-input py-2.5 text-sm font-medium hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowLogoutConfirm(false); doLogout() }}
                className="flex-1 rounded-xl bg-destructive text-destructive-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default AppShell