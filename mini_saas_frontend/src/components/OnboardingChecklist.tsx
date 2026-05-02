'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  CheckCircle2, 
  Scan, 
  Smartphone, 
  FileText, 
  ArrowRight,
  Zap,
  Check
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChecklistItem {
  id: string
  label: string
  sub: string
  icon: any
  completed: boolean
}

export default function OnboardingChecklist() {
  const [items, setItems] = useState<ChecklistItem[]>([
    { id: 'firstScan', label: 'Scan First Bill', sub: 'Try our high-speed OCR', icon: Scan, completed: false },
    { id: 'firstInvoice', label: 'Create Invoice', sub: 'Generate your first GST bill', icon: FileText, completed: true },
    { id: 'whatsappSync', label: 'Link WhatsApp', sub: 'Automate payment reminders', icon: Smartphone, completed: false },
  ])

  const progress = Math.round((items.filter(i => i.completed).length / items.length) * 100)

  return (
    <div className="card-base p-6 bg-card/40 backdrop-blur-md border-border/50 relative overflow-hidden group">
      {/* Background Glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors" />

      <header className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary fill-primary/20" /> Launch Sequence
          </h3>
          <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-widest">{progress}% Mission Ready</p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center font-black text-xs">
          {items.filter(i => i.completed).length}/{items.length}
        </div>
      </header>

      <div className="space-y-3">
        {items.map((item) => (
          <button
            key={item.id}
            className={cn(
              "w-full p-4 rounded-2xl border transition-all flex items-center gap-4 text-left group/item",
              item.completed 
                ? "bg-success-soft/20 border-success/20" 
                : "bg-card border-border/50 hover:border-primary/30"
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
              item.completed ? "bg-success text-white" : "bg-muted text-muted-foreground group-hover/item:bg-primary/10 group-hover/item:text-primary"
            )}>
              {item.completed ? <Check className="w-5 h-5" /> : <item.icon className="w-5 h-5" />}
            </div>
            <div className="flex-1">
              <p className={cn("text-xs font-black uppercase tracking-tight", item.completed ? "text-success/70" : "text-foreground")}>
                {item.label}
              </p>
              <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-tighter opacity-60">
                {item.sub}
              </p>
            </div>
            {!item.completed && <ArrowRight className="w-4 h-4 text-muted-foreground group-hover/item:translate-x-1 transition-transform" />}
          </button>
        ))}
      </div>

      {progress === 100 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 p-4 bg-primary text-primary-foreground rounded-2xl text-center shadow-glow"
        >
          <p className="text-[10px] font-black uppercase tracking-widest">Workspace Activated</p>
        </motion.div>
      )}
    </div>
  )
}