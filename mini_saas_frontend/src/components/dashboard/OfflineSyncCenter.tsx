'use client'

import { useState, useEffect } from 'react'
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  CloudOff, 
  History,
  ArrowRight,
  Database,
  ShieldCheck,
  Zap,
  Users,
  FileText
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface SyncItem {
  id: string
  type: 'Invoice' | 'Product' | 'Customer'
  data: string
  status: 'Pending' | 'Syncing' | 'Failed'
  timestamp: string
}

export function OfflineSyncCenter() {
  const [isOnline, setIsOnline] = useState(true)
  const [syncQueue, setSyncQueue] = useState<SyncItem[]>([
    { id: 'INV-0034', type: 'Invoice', data: '₹4,671 - Anjali Sharma', status: 'Pending', timestamp: '2 mins ago' },
    { id: 'PRD-882', type: 'Product', data: 'LG Smart TV (Stock Update)', status: 'Failed', timestamp: '15 mins ago' },
    { id: 'CUST-002', type: 'Customer', data: 'Arjun Kumar (Udhar Update)', status: 'Pending', timestamp: '1 hour ago' },
  ])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const retrySync = (id: string) => {
    setSyncQueue(prev => prev.map(item => 
      item.id === id ? { ...item, status: 'Syncing' } : item
    ))
    // Simulate sync success after 2 seconds
    setTimeout(() => {
      setSyncQueue(prev => prev.filter(item => item.id !== id))
    }, 2000)
  }

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
        <div className="flex items-center gap-3">
           <div className={`p-2 rounded-xl ${isOnline ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>
              {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
           </div>
           <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight">Offline Ghost Sync</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                 {isOnline ? 'System is Online' : 'Running in Offline Mode'}
              </p>
           </div>
        </div>
        <button className="p-2 text-slate-300 hover:text-indigo-600 transition-colors">
           <RefreshCw className={`w-4 h-4 ${!isOnline ? 'opacity-20' : ''}`} />
        </button>
      </div>

      {/* Sync Queue */}
      <div className="p-6 space-y-4 max-h-[350px] overflow-y-auto custom-scrollbar">
         <AnimatePresence mode='popLayout'>
            {syncQueue.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-10 flex flex-col items-center justify-center text-slate-300 gap-3 italic"
              >
                 <CheckCircle2 className="w-10 h-10 text-emerald-500 opacity-50" />
                 <p className="text-xs font-bold text-center uppercase tracking-widest">Everything Synced</p>
              </motion.div>
            ) : (
              syncQueue.map((item) => (
                <motion.div 
                  layout
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between group"
                >
                   <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm ${item.status === 'Failed' ? 'text-rose-500' : 'text-slate-400'}`}>
                         {item.type === 'Invoice' ? <FileText className="w-5 h-5" /> : item.type === 'Product' ? <Database className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                      </div>
                      <div>
                         <p className="text-xs font-black text-slate-900">{item.id}</p>
                         <p className="text-[10px] text-slate-400 font-bold line-clamp-1">{item.data}</p>
                      </div>
                   </div>
                   
                   <div className="flex items-center gap-4">
                      <div className="text-right">
                         <p className={`text-[10px] font-black uppercase tracking-widest ${item.status === 'Failed' ? 'text-rose-500' : 'text-amber-500'}`}>
                            {item.status}
                         </p>
                         <p className="text-[9px] text-slate-300 font-bold">{item.timestamp}</p>
                      </div>
                      {item.status !== 'Syncing' && (
                        <button 
                          onClick={() => retrySync(item.id)}
                          className="p-2 bg-white rounded-lg shadow-sm text-slate-400 hover:text-indigo-600 transition-all active:scale-95"
                        >
                           <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      {item.status === 'Syncing' && (
                         <div className="p-2">
                            <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" />
                         </div>
                      )}
                   </div>
                </motion.div>
              ))
            )}
         </AnimatePresence>
      </div>

      {/* Footer Info */}
      <div className="p-6 bg-slate-900 text-white relative overflow-hidden group">
         <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
         <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <ShieldCheck className="w-5 h-5 text-indigo-400" />
               <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Local Integrity Secured</span>
            </div>
            <button className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:text-indigo-400 transition-colors">
               Full History <ArrowRight className="w-3 h-3" />
            </button>
         </div>
</div>
     </div>
   )
 }
