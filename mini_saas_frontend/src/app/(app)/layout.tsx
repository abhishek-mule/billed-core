'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Home, 
  FileText, 
  ShoppingBag, 
  Settings,
  ScanLine
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Home', icon: Home, path: '/dashboard' },
  { id: 'invoices', label: 'Invoices', icon: FileText, path: '/invoices' },
  { id: 'scan', label: 'Scan', icon: ScanLine, path: '/scan', isPrimary: true },
  { id: 'purchases', label: 'Purchases', icon: ShoppingBag, path: '/purchases' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0 md:pl-20 lg:pl-64 flex flex-col">
      {/* Desktop Sidebar (hidden on mobile) */}
      <aside className="hidden md:flex flex-col fixed top-0 left-0 h-screen w-20 lg:w-64 bg-card border-r border-border z-30 transition-all duration-300">
        <div className="p-4 flex items-center justify-center lg:justify-start gap-3 h-16 border-b border-border">
          <div className="w-8 h-8 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-bold text-lg shadow-glow">
            B
          </div>
          <span className="hidden lg:block text-xl font-bold tracking-tight text-foreground">BillZo</span>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-2">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.path || (item.path !== '/dashboard' && pathname.startsWith(item.path))
            const Icon = item.icon
            
            return (
              <Link
                key={item.id}
                href={item.path}
                className={cn(
                  "group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  item.isPrimary && "bg-primary text-primary-foreground shadow-elegant hover:bg-primary/90 hover:text-primary-foreground"
                )}
                title={item.label}
              >
                <Icon className={cn(
                  "w-5 h-5 flex-shrink-0",
                  !item.isPrimary && isActive && "text-primary",
                  !item.isPrimary && !isActive && "group-hover:text-foreground"
                )} />
                <span className={cn(
                  "font-medium hidden lg:block",
                  item.isPrimary && "text-primary-foreground"
                )}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-8 animate-fade-in">
        <header className="flex md:hidden items-center justify-between mb-6">
           <div className="flex items-center gap-2">
             <div className="w-8 h-8 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-bold text-lg shadow-glow">
               B
             </div>
             <span className="text-xl font-bold tracking-tight text-foreground">BillZo</span>
           </div>
           <div className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-sm font-semibold border border-border">
             U
           </div>
        </header>
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border px-6 py-3 pb-safe z-40 flex justify-between items-center">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.path || (item.path !== '/dashboard' && pathname.startsWith(item.path))
          const Icon = item.icon

          if (item.isPrimary) {
            return (
              <Link 
                key={item.id}
                href={item.path}
                className="relative -top-5 flex flex-col items-center justify-center"
              >
                <div className="w-14 h-14 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-glow border-4 border-background">
                  <Icon className="w-6 h-6" />
                </div>
              </Link>
            )
          }

          return (
            <Link
              key={item.id}
              href={item.path}
              className={cn(
                "flex flex-col items-center gap-1",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}