'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Menu, 
  Home, 
  ShoppingCart, 
  FileText, 
  ShoppingBag, 
  Users, 
  Package, 
  BarChart3, 
  Settings,
  Search,
  X
} from 'lucide-react'
import { BillzoLogo } from '@/components/logo/BillzoLogo'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home, path: '/dashboard' },
  { id: 'pos', label: 'POS', icon: ShoppingCart, path: '/dashboard/pos' },
  { id: 'invoices', label: 'Invoices', icon: FileText, path: '/dashboard/invoices' },
  { id: 'purchases', label: 'Purchases', icon: ShoppingBag, path: '/dashboard/purchases' },
  { id: 'parties', label: 'Parties', icon: Users, path: '/dashboard/parties' },
  { id: 'products', label: 'Products', icon: Package, path: '/dashboard/products' },
  { id: 'reports', label: 'Reports', icon: BarChart3, path: '/dashboard/reports' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/dashboard/settings' },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200/60 z-40 flex items-center px-4 gap-4">
        {/* Hamburger Menu */}
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          {sidebarOpen ? (
            <X className="w-5 h-5 text-slate-600" />
          ) : (
            <Menu className="w-5 h-5 text-slate-600" />
          )}
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2">
          <BillzoLogo className="w-8 h-8" />
          <span className="text-xl font-bold text-slate-800">Billzo</span>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-xl mx-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search products, invoices, parties..." 
              className="w-full h-10 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all"
            />
          </div>
        </div>

        {/* User Avatar */}
        <div className="w-8 h-8 bg-teal-500 rounded-full flex items-center justify-center">
          <span className="text-white text-sm font-medium">U</span>
        </div>
      </header>

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed top-16 left-0 h-[calc(100vh-4rem)] bg-white border-r border-slate-200/60 transition-all duration-300 ease-in-out z-30",
          sidebarOpen ? "w-64" : "w-20"
        )}
      >
        <nav className="p-4 space-y-2">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.path || (item.path !== '/dashboard' && pathname.startsWith(item.path))
            const Icon = item.icon
            
            return (
              <Link
                key={item.id}
                href={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                  isActive 
                    ? "bg-teal-50 text-teal-700" 
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                )}
              >
                <Icon className={cn(
                  "w-5 h-5 flex-shrink-0",
                  isActive ? "text-teal-600" : "text-slate-400"
                )} />
                <span className={cn(
                  "font-medium text-sm transition-opacity duration-200",
                  sidebarOpen ? "opacity-100" : "opacity-0 hidden"
                )}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main 
        className={cn(
          "pt-16 min-h-screen transition-all duration-300 ease-in-out",
          sidebarOpen ? "ml-64" : "ml-20"
        )}
      >
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  )
}