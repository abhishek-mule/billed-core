'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ActionHeader } from '@/components/layout/ActionHeader'
import { NAVIGATION_ITEMS } from '@/lib/navigation'
import { Camera } from 'lucide-react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0 md:pl-20 lg:pl-64 flex flex-col">
      <ActionHeader businessName="Sharma Electronics" />

      {/* Desktop Sidebar (hidden on mobile) */}
      <aside className="hidden md:flex flex-col fixed top-0 left-0 h-screen w-20 lg:w-64 bg-card border-r border-border z-50 transition-all duration-300">
        <div className="p-4 flex items-center justify-center lg:justify-start gap-3 h-16 border-b border-border">
          <div className="w-8 h-8 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-bold text-lg shadow-glow">
            B
          </div>
          <span className="hidden lg:block text-xl font-bold tracking-tight text-foreground">BillZo</span>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-2">
          {NAVIGATION_ITEMS.map((item) => {
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
        {children}
      </main>

      {/* Floating Scan Button (Mobile Only) */}
      {pathname !== '/scan' && (
        <Link 
          href="/scan"
          className="fixed bottom-24 right-6 w-14 h-14 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-glow active:scale-90 transition-all z-40 md:hidden animate-in fade-in zoom-in duration-300"
        >
          <Camera className="w-6 h-6" />
        </Link>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-lg border-t border-border px-6 py-3 pb-safe z-40 flex justify-between items-center shadow-elegant">
        {NAVIGATION_ITEMS.map((item) => {
          const isActive = pathname === item.path || (item.path !== '/dashboard' && pathname.startsWith(item.path))
          const Icon = item.icon

          if (item.isPrimary) {
            return (
              <Link 
                key={item.id}
                href={item.path}
                className="relative -top-6 flex flex-col items-center justify-center group"
              >
                <div className="w-16 h-16 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-glow border-[6px] border-background active:scale-90 transition-all">
                  <Icon className="w-7 h-7" />
                </div>
              </Link>
            )
          }

          return (
            <Link
              key={item.id}
              href={item.path}
              className={cn(
                "flex flex-col items-center gap-1.5 transition-all active:scale-90",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-bold tracking-tight">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>

  )
}