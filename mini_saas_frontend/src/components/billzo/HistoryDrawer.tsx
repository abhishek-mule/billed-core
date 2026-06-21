"use client"

import { useState, useEffect } from "react"
import { X, CreditCard, Hand, MessageSquare, Phone, Clock, Loader2 } from "lucide-react"
import { formatINR } from "@/lib/utils"

export interface TimelineEvent {
  id: string
  type: 'reminder' | 'promise' | 'payment' | 'call' | 'system'
  customerId: string
  customerName: string
  amount: number
  label: string
  detail: string
  occurredAt: string
  status: string
}

// Module-level cache for preloaded timeline data
const timelineCache = new Map<string, TimelineEvent[]>()

export function prefetchCustomerTimeline(customerId: string) {
  if (timelineCache.has(customerId)) return
  fetch(`/api/recovery/timeline?customerId=${customerId}&limit=50`, { credentials: "include" })
    .then(r => r.json())
    .then(data => timelineCache.set(customerId, data.events || []))
    .catch(() => {})
}

interface HistoryDrawerProps {
  customerId: string
  customerName: string
  open: boolean
  onClose: () => void
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  payment: { icon: CreditCard, color: 'text-emerald-600 bg-emerald-50' },
  promise: { icon: Hand, color: 'text-purple-600 bg-purple-50' },
  reminder: { icon: MessageSquare, color: 'text-blue-600 bg-blue-50' },
  call: { icon: Phone, color: 'text-amber-600 bg-amber-50' },
  system: { icon: Clock, color: 'text-slate-600 bg-slate-50' },
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
}

function statusBadge(status: string, type: string): { label: string; className: string } | null {
  if (type === 'payment' && status === 'success') {
    return { label: 'Paid', className: 'bg-emerald-100 text-emerald-700' }
  }
  if (type === 'promise') {
    if (status === 'broken') return { label: 'Broken', className: 'bg-rose-100 text-rose-700' }
    return { label: 'Active', className: 'bg-purple-100 text-purple-700' }
  }
  if (type === 'reminder') {
    if (status === 'delivered') return { label: 'Delivered', className: 'bg-blue-100 text-blue-700' }
    if (status === 'read') return { label: 'Read', className: 'bg-emerald-100 text-emerald-700' }
    if (status === 'failed') return { label: 'Failed', className: 'bg-rose-100 text-rose-700' }
    if (status === 'sent') return { label: 'Sent', className: 'bg-slate-100 text-slate-700' }
    return { label: status, className: 'bg-slate-100 text-slate-600' }
  }
  return null
}

export function HistoryDrawer({ customerId, customerName, open, onClose }: HistoryDrawerProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !customerId) return
    const cached = timelineCache.get(customerId)
    if (cached) {
      setEvents(cached)
      setLoading(false)
      return
    }
    setLoading(true)
    fetch(`/api/recovery/timeline?customerId=${customerId}&limit=50`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        const events = data.events || []
        timelineCache.set(customerId, events)
        setEvents(events)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, customerId])

  return (
    <>
      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-white shadow-xl border-l border-slate-200 transform transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">History</h2>
            <p className="text-xs text-slate-500 mt-0.5">{customerName}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        <div className="overflow-y-auto h-[calc(100%-57px)]">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Clock size={32} className="mb-2" />
              <p className="text-sm font-medium">No activity yet</p>
            </div>
          ) : (
            <div className="relative px-5 py-4">
              {/* Timeline line */}
              <div className="absolute left-[29px] top-0 bottom-0 w-px bg-slate-100" />

              <div className="space-y-0">
                {events.map((ev, i) => {
                  const config = TYPE_CONFIG[ev.type] || TYPE_CONFIG.system
                  const Icon = config.icon
                  const badge = statusBadge(ev.status, ev.type)
                  const isLast = i === events.length - 1
                  return (
                    <div key={ev.id} className="relative flex gap-3 pb-4">
                      {/* Dot */}
                      <div className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${config.color}`}>
                        <Icon size={12} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900">{ev.label}</p>
                          {badge && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.className}`}>
                              {badge.label}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{ev.detail}</p>
                        {ev.amount > 0 && (
                          <p className="text-xs font-semibold text-slate-700 mt-0.5">{formatINR(ev.amount)}</p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-0.5">{formatTime(ev.occurredAt)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
