'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Receipt, ScanLine, Package, Users, ShoppingCart, Settings, Wifi, WifiOff, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBillzo } from './useBillzo'

const mobileNav = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/invoices', label: 'Invoices', icon: Receipt },
  { href: '/pos', label: 'POS', icon: ScanLine, primary: true },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/parties', label: 'Parties', icon: Users },
]

const moreItems = [
  { href: '/purchases', label: 'Purchases', icon: ShoppingCart },
  { href: '/reports', label: 'Reports', icon: TrendingUp },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { state } = useBillzo()
  const pending = state?.snapshot.queueCount || 0

  return (
    <div className="min-h-screen bg-background text-foreground md:grid md:grid-cols-[88px_1fr] lg:grid-cols-[220px_1fr]">
      <aside className="hidden border-r bg-white md:flex md:min-h-screen md:flex-col md:justify-between">
        <div>
          <div className="flex h-16 items-center gap-3 px-5">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-foreground text-base font-black text-white">B</div>
            <span className="hidden text-lg font-black lg:block">Billzo</span>
          </div>
          <nav className="space-y-1 px-3">
            {mobileNav.map((item) => <NavItem key={item.href} item={item} active={pathname.startsWith(item.href)} />)}
            <div className="my-4 border-t" />
            {moreItems.map((item) => <NavItem key={item.href} item={item} active={pathname.startsWith(item.href)} />)}
          </nav>
        </div>
        <QueueBadge pending={pending} />
      </aside>

      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 md:px-8 md:py-8">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-white/95 px-2 pb-3 pt-2 shadow-2xl backdrop-blur md:hidden">
        {mobileNav.map((item) => {
          const Icon = item.icon
          const active = pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  'grid h-10 w-10 place-items-center rounded-lg transition',
                  item.primary && 'h-14 w-14 -translate-y-5 bg-foreground text-white shadow-lg',
                  active && !item.primary && 'bg-primary text-primary-foreground',
                  !active && !item.primary && 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              {!item.primary && <span className="text-[10px] font-bold">{item.label}</span>}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

function NavItem({ item, active }: { item: (typeof mobileNav)[number]; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center justify-center gap-3 rounded-lg px-3 py-3 text-sm font-black lg:justify-start',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
        item.primary && !active && 'bg-foreground text-white'
      )}
      title={item.label}
    >
      <Icon className="h-5 w-5" />
      <span className="hidden lg:block">{item.label}</span>
    </Link>
  )
}

function QueueBadge({ pending }: { pending: number }) {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine
  return (
    <div className="m-3 rounded-lg border bg-muted p-3 text-xs font-bold text-muted-foreground">
      <div className="flex items-center gap-2">
        {online ? <Wifi className="h-4 w-4 text-success" /> : <WifiOff className="h-4 w-4 text-warning" />}
        <span>{pending} queued</span>
      </div>
    </div>
  )
}
