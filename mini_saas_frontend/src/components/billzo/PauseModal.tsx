"use client"

import { useState } from "react"
import { Loader2, AlertCircle, CheckCircle2, Pause } from "lucide-react"

interface PauseModalProps {
  customerId: string
  customerName: string
  caseId: string
  onClose: () => void
  onSuccess: () => void
}

const QUICK_OPTIONS = [
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "7 days", days: 7 },
  { label: "Custom", days: null },
]

export function PauseModal({ customerId, customerName, caseId, onClose, onSuccess }: PauseModalProps) {
  const [selectedOption, setSelectedOption] = useState<number | null>(3)
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, any> = {}
      if (selectedOption !== null) {
        payload.snoozeDays = selectedOption
      } else {
        const diff = Math.ceil((new Date(customDate).getTime() - Date.now()) / 86400000)
        payload.snoozeDays = Math.max(1, diff)
      }

      const res = await fetch("/api/recovery/queue/actions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          action: "snooze",
          customerId,
          payload,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to pause")
      setSuccess(true)
      setTimeout(() => { onSuccess(); onClose() }, 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const days = selectedOption !== null ? selectedOption : Math.ceil((new Date(customDate).getTime() - Date.now()) / 86400000)
  const pauseUntil = new Date(Date.now() + days * 86400000)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Pause className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Pause Automation</h2>
            <p className="text-sm text-slate-500">{customerName}</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {success ? (
          <div className="flex flex-col items-center gap-2 py-6 text-emerald-700">
            <CheckCircle2 size={40} />
            <p className="font-semibold">Paused until {pauseUntil.toLocaleDateString("en-IN", { day: "numeric", month: "long" })}</p>
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Pause for</label>
              <div className="grid grid-cols-4 gap-2">
                {QUICK_OPTIONS.map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => opt.days !== null && setSelectedOption(opt.days)}
                    disabled={opt.days === null}
                    className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                      selectedOption === opt.days
                        ? "bg-amber-50 text-amber-700 border-amber-300"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    } ${opt.days === null ? "opacity-50" : ""}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500 mb-2">
                Automation will resume on <strong>{pauseUntil.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</strong>
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 h-10 rounded-lg bg-amber-600 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Pause Until {pauseUntil.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
