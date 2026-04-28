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
  ShoppingCart
} from 'lucide-react'

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
    { id: 'new-invoice', label: 'New Invoice', icon: Plus, shortcut: 'N', category: 'Quick Actions', path: '/merchant/billing' },
    { id: 'add-product', label: 'Add Product', icon: Package, shortcut: 'P', category: 'Inventory', path: '/merchant/inventory' },
    { id: 'view-reports', label: 'View Reports', icon: BarChart3, shortcut: 'R', category: 'Analytics', path: '/merchant/reports' },
    { id: 'settings', label: 'Settings', icon: Settings, shortcut: 'S', category: 'Account', path: '/merchant/settings' },
    { id: 'inward-stock', label: 'Inward Stock', icon: Zap, shortcut: 'I', category: 'Inventory', path: '/merchant/purchase' },
  ]

  const filteredActions = actions.filter(a => 
    a.label.toLowerCase().includes(query.toLowerCase()) || 
    a.category.toLowerCase().includes(query.toLowerCase())
  )

  const handleAction = (path: string) => {
    router.push(path)
    setIsOpen(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={() => setIsOpen(false)} 
      />

      {/* Palette Container */}
      <div className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-300 flex flex-col border border-slate-100">
        
        {/* Search Bar */}
        <div className="flex items-center px-8 py-6 border-b border-slate-50 gap-4">
          <Search className="w-6 h-6 text-slate-300" />
          <input 
            autoFocus
            type="text" 
            placeholder="Type a command or search (Ctrl + K)..." 
            className="flex-1 bg-transparent text-lg font-bold text-slate-900 focus:outline-none placeholder:text-slate-300"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex items-center gap-2">
             <kbd className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-black text-slate-400">ESC</kbd>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto max-h-[60vh] p-4">
          {filteredActions.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-slate-400 italic">No results found for "{query}"</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Grouped Actions */}
              {Array.from(new Set(filteredActions.map(a => a.category))).map(cat => (
                <div key={cat}>
                  <h4 className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{cat}</h4>
                  <div className="space-y-1">
                    {filteredActions.filter(a => a.category === cat).map(action => (
                      <button 
                        key={action.id}
                        onClick={() => handleAction(action.path)}
                        className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl hover:bg-slate-50 transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                             <action.icon className="w-5 h-5" />
                          </div>
                          <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">{action.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest group-hover:text-slate-400">Go to</span>
                           <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded text-[9px] font-black text-slate-500">{action.shortcut}</kbd>
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
        <div className="bg-slate-50 px-8 py-4 border-t border-slate-100 flex items-center justify-between">
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                 <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-black text-slate-400">↑↓</kbd>
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Navigate</span>
              </div>
              <div className="flex items-center gap-2">
                 <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-black text-slate-400">⏎</kbd>
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select</span>
              </div>
           </div>
           <div className="flex items-center gap-2 opacity-50">
              <Zap className="w-3 h-3 text-indigo-500" />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Powered by Billed Engine</span>
           </div>
        </div>
      </div>
    </div>
  )
}
