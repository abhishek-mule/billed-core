"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Calendar, Clock, Loader2, X, CalendarClock, ChevronRight, Check } from "lucide-react"
import { formatINR } from "@/lib/utils"

interface InvoiceOption {
  id: string
  invoiceNumber: string
  total: number
  status: string
}

interface ScheduleModalProps {
  customerId: string
  customerName: string
  amount: number
  invoices: InvoiceOption[]
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ScheduleModal({
  customerId,
  customerName,
  amount,
  invoices,
  open,
  onClose,
  onSuccess,
}: ScheduleModalProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(invoices[0]?.id || '')
  const [preset, setPreset] = useState<'tomorrow' | '3days' | '7days' | 'custom'>('tomorrow')
  const [customDate, setCustomDate] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [timeOfDay, setTimeOfDay] = useState<'10:00' | '14:00' | '18:00'>('10:00')
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  function getScheduledDateTime(): Date {
    const d = new Date()
    if (preset === 'tomorrow') {
      d.setDate(d.getDate() + 1)
    } else if (preset === '3days') {
      d.setDate(d.getDate() + 3)
    } else if (preset === '7days') {
      d.setDate(d.getDate() + 7)
    } else {
      const parts = customDate.split('-')
      if (parts.length === 3) {
        d.setFullYear(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
      }
    }
    const [hours, minutes] = timeOfDay.split(':').map(Number)
    d.setHours(hours, minutes, 0, 0)
    return d
  }

  const handleSchedule = async () => {
    const scheduledDate = getScheduledDateTime()
    if (scheduledDate <= new Date()) {
      toast.error("Please select a future date and time")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/recovery/queue/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "schedule_reminder",
          customerId,
          payload: {
            dueDate: scheduledDate.toISOString(),
            invoiceId: selectedInvoiceId || invoices[0]?.id,
          },
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || "Failed to schedule reminder")
      }

      const formatted = scheduledDate.toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
      toast.success(`Reminder scheduled for ${formatted}`)
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err.message || "Failed to schedule reminder")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
              <CalendarClock size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Schedule Reminder</h2>
              <p className="text-xs text-muted-foreground">{customerName} · {formatINR(amount)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Invoice selection if multiple */}
        {invoices.length > 1 && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Select Invoice</label>
            <select
              value={selectedInvoiceId}
              onChange={(e) => setSelectedInvoiceId(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:border-primary"
            >
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — {formatINR(inv.total)} ({inv.status})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date presets */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">When to send reminder</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'tomorrow', label: 'Tomorrow' },
              { id: '3days', label: 'In 3 Days' },
              { id: '7days', label: 'In 7 Days' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id as any)}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                  preset === p.id
                    ? 'border-indigo-600 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                    : 'border-border bg-card hover:bg-muted text-muted-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date picker */}
        <div>
          <button
            type="button"
            onClick={() => setPreset('custom')}
            className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all ${
              preset === 'custom'
                ? 'border-indigo-600 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                : 'border-border bg-card hover:bg-muted text-muted-foreground'
            }`}
          >
            <div className="flex items-center gap-2">
              <Calendar size={15} />
              <span>Pick Custom Date</span>
            </div>
            {preset === 'custom' && <Check size={14} />}
          </button>
          {preset === 'custom' && (
            <input
              type="date"
              value={customDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setCustomDate(e.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:border-primary"
            />
          )}
        </div>

        {/* Time of day selector */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Time of day</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { time: '10:00', label: '10:00 AM (Morning)' },
              { time: '14:00', label: '2:00 PM (Afternoon)' },
              { time: '18:00', label: '6:00 PM (Evening)' },
            ].map((t) => (
              <button
                key={t.time}
                type="button"
                onClick={() => setTimeOfDay(t.time as any)}
                className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold text-center transition-all ${
                  timeOfDay === t.time
                    ? 'border-indigo-600 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                    : 'border-border bg-card hover:bg-muted text-muted-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-border rounded-xl text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSchedule}
            disabled={submitting}
            className="flex-1 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
            {submitting ? 'Scheduling...' : 'Schedule Reminder'}
          </button>
        </div>
      </div>
    </div>
  )
}
