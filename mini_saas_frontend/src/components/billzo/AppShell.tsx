'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sparkles, Bell, Search, Home, ScanLine, Receipt, ShoppingBag, Users, Package, BarChart3, Settings, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

const desktopItems = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/pos', label: 'POS', icon: ScanLine },
  { href: '/invoices', label: 'Invoices', icon: Receipt },
  { href: '/purchases', label: 'Purchases', icon: ShoppingBag },
  { href: '/parties', label: 'Parties', icon: Users },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
]

const mobileItems = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/invoices', label: 'Bills', icon: Receipt },
  { href: '/pos', label: 'POS', icon: ScanLine, primary: true },
  { href: '/products', label: 'Stock', icon: Package },
  { href: '/more', label: 'More', icon: MoreHorizontal },
]

function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/dashboard" className={`inline-flex items-center gap-2 font-bold text-lg ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-md">
        <Sparkles className="h-4 w-4" />
      </span>
      <span className="tracking-tight">BillZo</span>
    </Link>
  )
}

function DesktopSidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-card">
      <div className="px-6 py-5 border-b border-border">
        <Logo />
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {desktopItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="p-4 border-t border-border">
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            All synced
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Last: just now</p>
        </div>
      </div>
    </aside>
  )
}

function MobileTopBar() {
  return (
    <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card/95 backdrop-blur px-4 h-14">
      <Logo />
      <div className="flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-medium text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
        Online
      </div>
    </header>
  )
}

function DesktopTopBar({ title }: { title?: string }) {
  return (
    <header className="hidden lg:flex sticky top-0 z-30 items-center justify-between gap-4 border-b border-border bg-card/95 backdrop-blur px-8 h-16">
      <h1 className="text-xl font-semibold tracking-tight">{title || 'BillZo'}</h1>
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
        <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">B</div>
      </div>
    </header>
  )
}

function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden">
      <div className="grid grid-cols-5 px-2 pb-4 pt-2">
        {mobileItems.map(({ href, label, icon: Icon, primary }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {primary ? (
                <span className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
                  <Icon className="h-6 w-6" />
                </span>
              ) : (
                <Icon className="h-5 w-5" />
              )}
              <span className={cn(primary && 'mt-0.5')}>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function AppShell({ children, title }: { children: React.ReactNode; title?: string }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen w-full bg-background">
      <DesktopSidebar pathname={pathname} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileTopBar />
        <DesktopTopBar title={title} />
        <main className="flex-1 pb-24 lg:pb-8">{children}</main>
        <BottomNav pathname={pathname} />
      </div>
    </div>
  )
}

export { Logo }