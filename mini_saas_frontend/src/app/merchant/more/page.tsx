'use client'

import Link from 'next/link'
import { 
  ShoppingBag, 
  FileText, 
  BarChart3, 
  Users, 
  Settings, 
  HelpCircle, 
  ChevronRight,
  LogOut,
  Bell,
  Moon,
  Shield
} from 'lucide-react'

const menuGroups = [
  {
    label: 'Transactions',
    items: [
      { href: '/merchant/invoice', label: 'All Invoices', icon: FileText, desc: 'View & manage invoices' },
      { href: '/merchant/purchases', label: 'Purchases', icon: ShoppingBag, desc: 'Track supplier bills' },
    ],
  },
  {
    label: 'Master Data',
    items: [
      { href: '/merchant/products', label: 'Products', icon: BarChart3, desc: 'Inventory & pricing' },
      { href: '/merchant/parties', label: 'Parties', icon: Users, desc: 'Customers & suppliers' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/merchant/settings', label: 'Settings', icon: Settings, desc: 'App preferences' },
      { href: '/merchant/settings', label: 'Notifications', icon: Bell, desc: 'WhatsApp & alerts' },
    ],
  },
  {
    label: 'Help',
    items: [
      { href: '/merchant/settings', label: 'Help & Support', icon: HelpCircle, desc: 'FAQs & contact' },
      { href: '/merchant/settings', label: 'Privacy Policy', icon: Shield, desc: 'Data & security' },
    ],
  },
]

export default function MorePage() {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">More</h1>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg hover:bg-muted transition-base">
            <Moon className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {menuGroups.map((group) => (
        <div key={group.label} className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
            {group.label}
          </h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {group.items.map((item, index) => (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-4 p-4 hover:bg-muted/40 transition-base ${
                  index < group.items.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary">
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      ))}

      <div className="pt-4">
        <button className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-destructive/5 transition-base text-destructive">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-destructive/10">
            <LogOut className="h-5 w-5" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-medium">Logout</div>
            <div className="text-xs text-muted-foreground">Sign out of your account</div>
          </div>
        </button>
      </div>
    </div>
  )
}
