'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Search, 
  FileText, 
  Users, 
  Package, 
  Plus, 
  Zap, 
  Settings, 
  BarChart3, 
  X,
  CreditCard,
  History,
  ShoppingCart,
  Scan,
  UserPlus
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const router = useRouter()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setIsOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const actions = [
    { id: 'new-invoice', label: 'Create Invoice', icon: Plus, shortcut: 'N', category: 'Billing', path: '/invoices/new' },
    { id: 'scan-bill', label: 'Scan Purchase Bill', icon: Scan, shortcut: 'O', category: 'Inventory', path: '/scan' },
    { id: 'view-invoices', label: 'View Invoices', icon: FileText, shortcut: 'V', category: 'Billing', path: '/invoices' },
    { id: 'add-customer', label: 'Add Customer', icon: UserPlus, shortcut: 'C', category: 'Contacts', path: '/customers/new' },
    { id: 'view-reports', label: 'Business Reports', icon: BarChart3, shortcut: 'R', category: 'Analytics', path: '/reports' },
    { id: 'settings', label: 'App Settings', icon: Settings, shortcut: 'S', category: 'System', path: '/settings' },
  ]

  const filteredActions = actions.filter(a => 
    a.label.toLowerCase().includes(query.toLowerCase()) || 
    a.category.toLowerCase().includes(query.toLowerCase())
  )

  const handleAction = (path: string) => {
    router.push(path)
    setIsOpen(false)
    setQuery('')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-md" 
        onClick={() => setIsOpen(false)} 
      />

      {/* Palette Container */}
      <div className="relative w-full max-w-2xl bg-card rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-300 flex flex-col border border-border/50 ring-1 ring-white/10">
        
        {/* Search Bar */}
        <div className="flex items-center px-8 py-7 border-b border-border/50 gap-4">
          <Search className="w-6 h-6 text-muted-foreground" />
          <input 
            autoFocus
            type="text" 
            placeholder="Type a command or search (Ctrl + K)..." 
            className="flex-1 bg-transparent text-xl font-black uppercase tracking-tight text-foreground focus:outline-none placeholder:text-muted-foreground/30"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex items-center gap-2">
             <kbd className="px-2 py-1 bg-muted border border-border rounded-lg text-[10px] font-black text-muted-foreground">ESC</kbd>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto max-h-[60vh] p-4 custom-scrollbar">
          {filteredActions.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-black uppercase tracking-widest text-muted-foreground italic opacity-50">No results found for "{query}"</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Grouped Actions */}
              {Array.from(new Set(filteredActions.map(a => a.category))).map(cat => (
                <div key={cat}>
                  <h4 className="px-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] mb-3">{cat}</h4>
                  <div className="space-y-1.5">
                    {filteredActions.filter(a => a.category === cat).map(action => (
                      <button 
                        key={action.id}
                        onClick={() => handleAction(action.path)}
                        className="w-full flex items-center justify-between px-4 py-4 rounded-2xl hover:bg-muted/50 transition-all group border border-transparent hover:border-border/50"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 rounded-xl bg-muted text-muted-foreground flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all shadow-sm">
                             <action.icon className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                             <span className="text-sm font-black uppercase tracking-tight text-foreground group-hover:text-primary transition-colors">{action.label}</span>
                             <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none mt-1">Quick Shortcut Available</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                           <span className="text-[10px] font-black text-muted-foreground/30 uppercase tracking-widest group-hover:text-primary/50 hidden sm:block">Launch</span>
                           <kbd className="px-2 py-1 bg-muted/50 border border-border rounded-lg text-[9px] font-black text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all">{action.shortcut}</kbd>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-muted/30 px-8 py-5 border-t border-border/50 flex items-center justify-between">
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                 <kbd className="px-1.5 py-0.5 bg-card border border-border rounded-md text-[9px] font-black text-muted-foreground">↑↓</kbd>
                 <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Navigate</span>
              </div>
              <div className="flex items-center gap-2">
                 <kbd className="px-1.5 py-0.5 bg-card border border-border rounded-md text-[9px] font-black text-muted-foreground">⏎</kbd>
                 <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Select</span>
              </div>
           </div>
           <div className="flex items-center gap-2 opacity-30">
              <Zap className="w-3 h-3 text-primary" />
              <span className="text-[9px] font-black text-foreground uppercase tracking-widest">Billed Engine 2.0</span>
           </div>
        </div>
      </div>
    </div>
  )
}
