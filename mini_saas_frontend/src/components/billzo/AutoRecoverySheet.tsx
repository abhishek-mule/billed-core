"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Bot, Loader2, X, Check, AlertCircle } from "lucide-react"

interface AutoRecoverySheetProps {
  open: boolean
  onClose: () => void
  onStatusChange?: (enabled: boolean) => void
}

export function AutoRecoverySheet({ open, onClose, onStatusChange }: AutoRecoverySheetProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [updatedBy, setUpdatedBy] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    fetch('/api/settings/auto-recovery')
      .then(res => res.json())
      .then(data => {
        if (!active) return
        setEnabled(data.enabled ?? true)
        setUpdatedBy(data.updatedBy ?? null)
        setUpdatedAt(data.updatedAt ?? null)
      })
      .catch(() => {
        toast.error("Failed to load Auto Recovery settings")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [open])

  if (!open) return null

  const handleToggle = async () => {
    const nextState = !enabled
    setSaving(true)
    try {
      const res = await fetch('/api/settings/auto-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState, userName: 'Merchant' }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setEnabled(nextState)
        setUpdatedBy(data.updatedBy)
        setUpdatedAt(data.updatedAt)
        onStatusChange?.(nextState)
        toast.success(nextState ? "Auto Recovery activated" : "Auto Recovery paused")
      } else {
        toast.error("Could not update Auto Recovery setting")
      }
    } catch {
      toast.error("Network error updating Auto Recovery setting")
    } finally {
      setSaving(false)
    }
  }

  function formatTime(iso: string | null) {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
              <Bot size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Auto Recovery</h2>
              <p className="text-xs text-muted-foreground">Automatic WhatsApp payment reminders</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="py-8 flex justify-center text-muted-foreground">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`p-4 rounded-xl border flex items-center justify-between ${enabled ? 'bg-primary/5 border-primary/20' : 'bg-muted/50 border-border'}`}>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider block text-muted-foreground mb-0.5">Current Mode</span>
                <p className="text-sm font-bold text-foreground">
                  {enabled ? '🟢 Active · Auto Recovery' : '🔴 Manual Recovery'}
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                  {enabled
                    ? 'BillZo automatically sends scheduled WhatsApp reminders to overdue customers.'
                    : 'Manual Recovery — BillZo won\'t send automatic reminders. All follow-ups require manual action.'}
                </p>
              </div>
              <button
                onClick={handleToggle}
                disabled={saving}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                  enabled
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {enabled ? 'Pause Auto' : 'Activate Auto'}
              </button>
            </div>

            {updatedBy && updatedAt && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
                <AlertCircle size={13} />
                <span>Last updated by {updatedBy} ({formatTime(updatedAt)})</span>
              </div>
            )}
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-muted text-foreground hover:bg-muted/80 rounded-xl text-xs font-bold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
