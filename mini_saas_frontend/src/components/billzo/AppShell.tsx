'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  Bell, Search, Home, ScanLine, Receipt,
  ShoppingBag, Users, Package, BarChart3, Settings,
  MoreHorizontal, Menu,
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

function Sidebar({
  pathname,
  collapsed,
  onToggle,
}: {
  pathname: string
  collapsed: boolean
  onToggle: () => void
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
        <div className="user-row">
          <div className="user-avatar">BS</div>
          <div className="user-info">
            <span className="user-name">BillZo Store</span>
            <span className="user-plan">Free plan</span>
          </div>
        </div>
        <span className="nav-tooltip nav-tooltip--user" aria-hidden="true">BillZo Store</span>
      </div>
    </aside>
  )
}

function TopBar({
  title,
  onMobileMenu,
}: {
  title?: string
  onMobileMenu: () => void
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

        <div className="topbar-avatar">BS</div>
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

  useEffect(() => { setMobileOpen(false) }, [pathname])

  return (
    <>
      <div className={cn('shell', collapsed && 'shell--collapsed')}>
        <Sidebar
          pathname={pathname}
          collapsed={collapsed}
          onToggle={() => setCollapsed(c => !c)}
        />

        <MobileDrawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          pathname={pathname}
        />

        <div className="shell-body">
          <TopBar title={title} onMobileMenu={() => setMobileOpen(true)} />
          <main className="shell-main">{children}</main>
          <BottomNav pathname={pathname} />
        </div>
      </div>
    </>
  )
}

export default AppShell