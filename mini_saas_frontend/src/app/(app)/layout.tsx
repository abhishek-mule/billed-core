'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ActionHeader } from '@/components/layout/ActionHeader'
import { NAVIGATION_ITEMS } from '@/lib/navigation'
import { Camera, Search, Command } from 'lucide-react'
import { CommandPalette } from '@/components/CommandPalette'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0 md:pl-24 lg:pl-72 flex flex-col selection:bg-primary selection:text-primary-foreground">
      <ActionHeader businessName="Sharma Electronics" />
      
      <CommandPalette />

      {/* Desktop Sidebar (Modern & Accessible) */}
      <aside className="hidden md:flex flex-col fixed top-0 left-0 h-screen w-24 lg:w-72 bg-card border-r border-border/50 z-50 transition-all duration-300 shadow-xl shadow-black/5">
        <div className="p-6 flex items-center justify-center lg:justify-start gap-4 h-20 border-b border-border/50 bg-muted/20">
          <div className="w-10 h-10 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center font-black text-xl shadow-glow transition-transform hover:scale-105 active:scale-95 cursor-pointer">
            B
          </div>
          <span className="hidden lg:block text-2xl font-black tracking-tight text-foreground uppercase italic">BillZo</span>
        </div>

        <nav className="flex-1 py-10 px-4 space-y-3 custom-scrollbar overflow-y-auto">
          {NAVIGATION_ITEMS.map((item) => {
            const isActive = pathname === item.path || (item.path !== '/dashboard' && pathname.startsWith(item.path))
            const Icon = item.icon

            return (
              <Link
                key={item.id}
                href={item.path}
                className={cn(
                  "group flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-300 relative overflow-hidden",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-glow scale-[1.02]" 
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  item.isPrimary && !isActive && "bg-black text-white shadow-xl hover:bg-black/90"
                )}
                title={item.label}
              >
                <Icon className={cn(
                  "w-6 h-6 flex-shrink-0 transition-transform group-hover:scale-110",
                  isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground",
                  item.isPrimary && "text-white"
                )} />
                <span className={cn(
                  "font-black uppercase tracking-widest text-xs hidden lg:block leading-none",
                  isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground",
                  item.isPrimary && "text-white"
                )}>
                  {item.label}
                </span>
                
                {isActive && (
                   <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/20 rounded-l-full" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Command Trigger (Desktop) */}
        <div className="p-6 border-t border-border/50">
           <button 
             onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
             className="w-full flex items-center justify-center lg:justify-between gap-3 px-4 py-3 rounded-2xl bg-muted/30 hover:bg-muted/50 text-muted-foreground transition-all group border border-transparent hover:border-border/50"
           >
              <div className="flex items-center gap-3">
                 <Search className="w-5 h-5 group-hover:text-primary transition-colors" />
                 <span className="hidden lg:block text-[10px] font-black uppercase tracking-widest">Search...</span>
              </div>
              <div className="hidden lg:flex items-center gap-1 opacity-50">
                 <Command className="w-3 h-3" />
                 <span className="text-[10px] font-black">K</span>
              </div>
           </button>
        </div>
      </aside>

      {/* Main Content (Spaced for PWA feel) */}
      <main className="flex-1 w-full max-w-6xl mx-auto p-4 md:p-12 animate-fade-in">
        {children}
      </main>

      {/* Mobile Floating Action Button */}
      {pathname !== '/scan' && (
        <Link 
          href="/scan"
          className="fixed bottom-28 right-6 w-16 h-16 bg-primary text-primary-foreground rounded-[2rem] flex items-center justify-center shadow-glow active:scale-90 transition-all z-40 md:hidden animate-in fade-in zoom-in duration-500 border-4 border-background"
        >
          <Camera className="w-7 h-7" />
        </Link>
      )}

      {/* Mobile Bottom Navigation (Highly Accessible) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card/80 backdrop-blur-xl border-t border-border/50 px-8 py-4 pb-safe z-40 flex justify-between items-center shadow-2xl ring-1 ring-white/5">
        {NAVIGATION_ITEMS.map((item) => {
          const isActive = pathname === item.path || (item.path !== '/dashboard' && pathname.startsWith(item.path))
          const Icon = item.icon

          if (item.isPrimary) {
            return (
              <Link 
                key={item.id}
                href={item.path}
                className="relative -top-10 flex flex-col items-center justify-center group"
              >
                <div className={cn(
                  "w-20 h-20 rounded-[2.5rem] flex items-center justify-center shadow-2xl border-[8px] border-background active:scale-90 transition-all",
                  isActive ? "bg-primary text-primary-foreground shadow-glow" : "bg-black text-white"
                )}>
                  <Icon className="w-8 h-8" />
                </div>
              </Link>
            )
          }

          return (
            <Link
              key={item.id}
              href={item.path}
              className={cn(
                "flex flex-col items-center gap-2 transition-all active:scale-90",
                isActive ? "text-primary scale-110" : "text-muted-foreground opacity-60"
              )}
            >
              <Icon className="w-6 h-6" />
              <span className="text-[9px] font-black uppercase tracking-tighter">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}