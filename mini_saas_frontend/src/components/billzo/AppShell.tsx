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
          <img src="/logo.png" alt="BillZo" className="logo-img" />
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
            <img src="/logo.png" alt="BillZo" className="logo-img" />
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
      <style>{STYLES}</style>

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

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@500&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --font:    'DM Sans', system-ui, sans-serif;
  --mono:    'DM Mono', monospace;
  --bg:      #F7F6F4;
  --surface: #FFFFFF;
  --border:  #E6E3DC;
  --border2: #C8C4BC;
  --text:    #1C1B18;
  --text2:   #6A6760;
  --text3:   #A9A6A0;
  --accent:  #1C1B18;
  --afg:     #FFFFFF;
  --green:   #15803D;
  --sw:      220px;
  --sw-c:    56px;
  --tbh:     52px;
  --r:       6px;
  --ease:    cubic-bezier(0.16, 1, 0.3, 1);
}

body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

.shell { display: flex; min-height: 100svh; }
.shell-body {
  flex: 1; display: flex; flex-direction: column; min-width: 0;
  transition: margin-left 0.28s var(--ease);
}
.shell-main { flex: 1; padding-bottom: 72px; }

@media (min-width: 1024px) {
  .shell-body       { margin-left: var(--sw); }
  .shell--collapsed .shell-body { margin-left: var(--sw-c); }
  .shell-main       { padding-bottom: 2rem; }
}

.sidebar { display: none; }

@media (min-width: 1024px) {
  .sidebar {
    display: flex; flex-direction: column;
    position: fixed; inset-y: 0; left: 0;
    width: var(--sw); background: var(--surface);
    border-right: 1px solid var(--border);
    z-index: 40; overflow: hidden;
    transition: width 0.28s var(--ease);
  }
  .sidebar--collapsed { width: var(--sw-c); }
}

.sidebar-header {
  height: var(--tbh);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 10px 0 14px; border-bottom: 1px solid var(--border);
  flex-shrink: 0; overflow: hidden;
}

.sidebar-logo {
  display: inline-flex; align-items: center; gap: 8px;
  text-decoration: none; color: var(--text);
  font-size: 15px; font-weight: 600; letter-spacing: -0.02em;
  white-space: nowrap; flex-shrink: 0; min-width: 0;
}
.logo-img {
  width: 26px; height: 26px; object-fit: contain; flex-shrink: 0;
}
.logo-text {
  overflow: hidden; max-width: 120px;
  transition: max-width 0.25s var(--ease), opacity 0.18s; opacity: 1;
}
.sidebar--collapsed .logo-text { max-width: 0; opacity: 0; }

.ham-btn {
  width: 30px; height: 30px; flex-shrink: 0;
  border: 1px solid var(--border); border-radius: var(--r);
  background: transparent; cursor: pointer;
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 4px; padding: 0;
  transition: background 0.12s;
}
.ham-btn:hover { background: var(--bg); }
.ham-btn span {
  display: block; height: 1.5px; background: var(--text);
  border-radius: 2px;
  transition: width 0.22s var(--ease);
}
.ham-btn span:nth-child(1),
.ham-btn span:nth-child(2),
.ham-btn span:nth-child(3) { width: 13px; }
.ham-btn--collapsed span:nth-child(1) { width: 10px; }
.ham-btn--collapsed span:nth-child(3) { width: 10px; }

.sidebar-nav {
  flex: 1; padding: 8px 6px;
  display: flex; flex-direction: column; gap: 1px;
  overflow-y: auto; overflow-x: hidden;
}

.nav-section-label {
  display: block; font-size: 10px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--text3); padding: 4px 8px 3px;
  white-space: nowrap; overflow: hidden;
  transition: opacity 0.18s, max-height 0.25s var(--ease), padding 0.2s;
  max-height: 30px;
}
.nav-section-label--spaced { margin-top: 10px; }
.sidebar--collapsed .nav-section-label {
  opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0;
}

.nav-item {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 8px; border-radius: var(--r);
  font-size: 13px; font-weight: 400; color: var(--text2);
  text-decoration: none; position: relative; white-space: nowrap;
  transition: background 0.12s, color 0.12s, padding 0.28s var(--ease),
              justify-content 0.28s var(--ease);
  animation: navIn 0.35s var(--ease) both;
  animation-delay: calc(var(--i, 0) * 38ms);
}
@keyframes navIn {
  from { opacity: 0; transform: translateX(-6px); }
  to   { opacity: 1; transform: translateX(0); }
}
.nav-item:hover { background: var(--bg); color: var(--text); }
.nav-item--active { background: var(--bg); color: var(--text); font-weight: 500; }

.sidebar--collapsed .nav-item {
  justify-content: center; padding: 8px 0;
}

.nav-icon {
  display: grid; place-items: center;
  width: 18px; height: 18px; flex-shrink: 0;
  transition: width 0.28s var(--ease);
}
.sidebar--collapsed .nav-icon { width: 22px; height: 22px; }

.nav-label {
  flex: 1; overflow: hidden; max-width: 140px;
  transition: max-width 0.25s var(--ease), opacity 0.18s; opacity: 1;
}
.sidebar--collapsed .nav-label { max-width: 0; opacity: 0; }

.nav-tooltip {
  display: none;
  position: absolute; left: calc(100% + 10px); top: 50%;
  transform: translateY(-50%);
  background: var(--accent); color: var(--afg);
  font-size: 12px; font-weight: 500;
  padding: 5px 10px; border-radius: 5px;
  white-space: nowrap; pointer-events: none; z-index: 100;
  opacity: 0; transition: opacity 0.1s;
}
.nav-tooltip::before {
  content: ''; position: absolute; left: -4px; top: 50%;
  transform: translateY(-50%);
  border: 4px solid transparent;
  border-right-color: var(--accent); border-left: 0;
}
.sidebar--collapsed .nav-item:hover .nav-tooltip {
  display: block; opacity: 1;
}

.sidebar-footer {
  padding: 8px 6px; border-top: 1px solid var(--border);
  flex-shrink: 0; position: relative; overflow: hidden;
}
.user-row {
  display: flex; align-items: center; gap: 9px;
  padding: 8px; border-radius: 8px; cursor: pointer;
  transition: background 0.12s; overflow: hidden;
}
.user-row:hover { background: var(--bg); }
.sidebar--collapsed .user-row { justify-content: center; padding: 8px 0; }

.user-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--accent); color: var(--afg);
  font-size: 10px; font-weight: 600;
  display: grid; place-items: center; flex-shrink: 0;
}
.user-info {
  flex: 1; min-width: 0; overflow: hidden;
  max-width: 140px;
  transition: max-width 0.25s var(--ease), opacity 0.18s;
}
.sidebar--collapsed .user-info { max-width: 0; opacity: 0; }
.user-name { font-size: 12px; font-weight: 500; display: block; white-space: nowrap; }
.user-plan { font-size: 11px; color: var(--text3); display: block; white-space: nowrap; }

.nav-tooltip--user {
  bottom: 14px; top: auto; transform: none;
  left: calc(100% + 8px);
}
.sidebar--collapsed .sidebar-footer:hover .nav-tooltip--user {
  display: block; opacity: 1;
}

.sync-pill {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; color: var(--text3);
}
.sync-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--green); flex-shrink: 0;
  animation: pulse 2.5s ease-in-out infinite;
}
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

.topbar {
  height: var(--tbh); background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 0 16px;
  position: sticky; top: 0; z-index: 30;
}
@media (min-width: 1024px) { .topbar { padding: 0 24px; } }

.topbar-left { display: flex; align-items: center; gap: 10px; }
.topbar-right { display: flex; align-items: center; gap: 8px; }
.topbar-title { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }

.lg-hidden    { display: flex; }
.desktop-only { display: none; }
@media (min-width: 1024px) {
  .lg-hidden    { display: none !important; }
  .desktop-only { display: block !important; }
}

.mobile-ham {
  width: 32px; height: 32px;
  border: 1px solid var(--border); border-radius: var(--r);
  background: transparent; cursor: pointer;
  display: grid; place-items: center; color: var(--text2);
  transition: background 0.1s;
}
.mobile-ham:hover { background: var(--bg); }

.search-wrap { display: none; position: relative; align-items: center; }
@media (min-width: 640px) { .search-wrap { display: flex; } }
.search-icon { position: absolute; left: 9px; color: var(--text3); pointer-events: none; }
.search-input {
  height: 30px; width: 180px; border: 1px solid var(--border);
  border-radius: var(--r); background: var(--bg);
  padding: 0 32px 0 28px; font-size: 12px; font-family: var(--font);
  color: var(--text); outline: none;
  transition: border-color 0.15s, width 0.3s var(--ease);
}
.search-input::placeholder { color: var(--text3); }
.search-wrap--focused .search-input { border-color: var(--accent); width: 240px; }
.search-kbd {
  position: absolute; right: 8px;
  font-family: var(--mono); font-size: 10px; color: var(--text3);
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 4px; padding: 1px 4px; pointer-events: none;
}

.icon-btn {
  width: 30px; height: 30px; border: 1px solid var(--border);
  border-radius: var(--r); background: transparent; cursor: pointer;
  display: grid; place-items: center; color: var(--text2);
  transition: background 0.1s, border-color 0.1s; position: relative;
}
.icon-btn:hover { background: var(--bg); border-color: var(--border2); color: var(--text); }
.notif-dot {
  position: absolute; top: 5px; right: 5px;
  width: 5px; height: 5px; border-radius: 50%;
  background: #EF4444; border: 1.5px solid var(--surface);
}
.topbar-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--accent); color: var(--afg);
  font-size: 10px; font-weight: 600; display: grid; place-items: center;
}

.mobile-overlay {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(0,0,0,0); pointer-events: none;
  transition: background 0.25s, backdrop-filter 0.25s;
}
.mobile-overlay--open {
  background: rgba(0,0,0,0.38);
  pointer-events: auto;
  backdrop-filter: blur(2px);
}
@media (min-width: 1024px) { .mobile-overlay { display: none !important; } }

.mobile-drawer {
  position: absolute; inset-y: 0; left: 0; width: 252px;
  background: var(--surface); display: flex; flex-direction: column;
  transform: translateX(-100%); transition: transform 0.3s var(--ease);
  overflow-y: auto;
}
.mobile-drawer--open { transform: translateX(0); }

.mobile-drawer-header {
  height: var(--tbh); display: flex; align-items: center;
  justify-content: space-between; padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.mobile-drawer-nav {
  flex: 1; padding: 8px; display: flex; flex-direction: column; gap: 2px;
}
.mobile-nav-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 10px; border-radius: var(--r);
  font-size: 14px; color: var(--text2); text-decoration: none;
  transition: background 0.1s, color 0.1s;
  animation: drawerIn 0.3s var(--ease) both;
  animation-delay: calc(var(--di, 0) * 28ms + 60ms);
}
@keyframes drawerIn {
  from { opacity: 0; transform: translateX(-10px); }
  to   { opacity: 1; transform: translateX(0); }
}
.mobile-nav-item:hover       { background: var(--bg); color: var(--text); }
.mobile-nav-item--active     { background: var(--bg); color: var(--text); font-weight: 500; }
.mobile-drawer-footer {
  padding: 12px 16px; border-top: 1px solid var(--border); flex-shrink: 0;
}

.bottom-nav {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 30;
  background: var(--surface); border-top: 1px solid var(--border);
  display: grid; grid-template-columns: repeat(5, 1fr);
  padding: 6px 4px env(safe-area-inset-bottom, 0px);
}
.bottom-item {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 3px; padding: 6px 4px;
  font-size: 10px; font-weight: 500; color: var(--text3);
  text-decoration: none; transition: color 0.1s;
}
.bottom-item--active  { color: var(--text); }
.bottom-item--primary { color: var(--text); }
.bottom-fab {
  width: 44px; height: 44px; border-radius: 50%;
  background: var(--accent); color: var(--afg);
  display: grid; place-items: center;
  margin-top: -18px; flex-shrink: 0;
  box-shadow: 0 4px 14px rgba(0,0,0,0.18);
  transition: transform 0.14s var(--ease);
}
.bottom-fab:active { transform: scale(0.93); }
`