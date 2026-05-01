'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Home, 
  DollarSign, 
  ShoppingCart, 
  Package, 
  MoreHorizontal,
  X,
  CreditCard,
  BarChart3,
  Users,
  Settings
} from 'lucide-react'
import { MOBILE_BOTTOM_NAV, MOBILE_MORE_MENU } from '@/lib/navigation'
import { cn } from '@/lib/utils'

const iconMap: Record<string, any> = {
  Home,
  DollarSign,
  ShoppingCart,
  Package,
  MoreHorizontal,
  CreditCard,
  BarChart3,
  Users,
  Settings
}

export function MobileBottomNav() {
  const pathname = usePathname()
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)

  const isActive = (path: string) => {
    return pathname === path || pathname.startsWith(path + '/')
  }

  return (
    <>
      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 lg:hidden">
        <div className="flex items-center justify-around h-16">
          {MOBILE_BOTTOM_NAV.map((item) => {
            const Icon = iconMap[item.icon] || MoreHorizontal
            const active = isActive(item.path)

            if (item.id === 'more') {
              return (
                <button
                  key={item.id}
                  onClick={() => setIsMoreMenuOpen(true)}
                  className={cn(
                    "flex flex-col items-center justify-center w-full h-full px-2",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className="w-6 h-6 mb-1" />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              )
            }

            return (
              <Link
                key={item.id}
                href={item.path}
                className={cn(
                  "flex flex-col items-center justify-center w-full h-full px-2",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="w-6 h-6 mb-1" />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* More Menu Modal */}
      {isMoreMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Overlay */}
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsMoreMenuOpen(false)}
          />

          {/* Menu Content */}
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl p-6 animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">More Options</h2>
              <button
                onClick={() => setIsMoreMenuOpen(false)}
                className="p-2 hover:bg-muted rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {MOBILE_MORE_MENU.map((item) => {
                const Icon = iconMap[item.icon] || MoreHorizontal
                const active = isActive(item.path)

                return (
                  <Link
                    key={item.id}
                    href={item.path}
                    onClick={() => setIsMoreMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl transition-colors",
                      active 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    <Icon className="w-6 h-6" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}