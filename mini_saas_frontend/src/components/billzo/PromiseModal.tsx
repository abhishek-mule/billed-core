"use client"

import { useState } from "react"
import { Loader2, AlertCircle, CheckCircle2, Calendar, Clock } from "lucide-react"
import { formatINR } from "@/lib/utils"

interface PromiseModalProps {
  customerId: string
  customerName: string
  amount: number
  caseId: string
  onClose: () => void
  onSuccess: () => void
}

const TIME_SLOTS = [
  "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
  "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM",
  "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM",
]

export function PromiseModal({ customerId, customerName, amount, caseId, onClose, onSuccess }: PromiseModalProps) {
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  })
  const [reminderTime, setReminderTime] = useState("10:00 AM")
  const [promiseAmount, setPromiseAmount] = useState(amount)
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSave() {
    if (!dueDate) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/recovery/queue/actions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          action: "mark_promise",
          customerId,
          payload: {
            dueDate: new Date(dueDate + "T" + reminderTime).toISOString(),
            amount: promiseAmount,
            notes: notes.trim() || undefined,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to save promise")
      setSuccess(true)
      setTimeout(() => { onSuccess(); onClose() }, 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-700">
            <Calendar className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Customer Promise</h2>
            <p className="text-sm text-slate-500">{customerName} · {formatINR(amount)} outstanding</p>
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
            <p className="font-semibold text-slate-900">Promise recorded!</p>
            <p className="text-xs text-slate-500">
              Reminder on {new Date(dueDate + "T" + reminderTime).toLocaleDateString("en-IN", { day: "numeric", month: "long" })} at {reminderTime}
            </p>
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount promised</label>
              <input
                type="number"
                value={promiseAmount}
                onChange={e => setPromiseAmount(Number(e.target.value))}
                className="w-full mt-1 h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Promise date</label>
              <div className="relative mt-1">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reminder time</label>
              <div className="relative mt-1">
                <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select
                  value={reminderTime}
                  onChange={e => setReminderTime(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-200 appearance-none"
                >
                  {TIME_SLOTS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Reminder will be sent at this time on the promise date
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Payment after salary release"
                rows={2}
                className="w-full mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none"
              />
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
                disabled={saving || !dueDate}
                className="flex-1 h-10 rounded-lg bg-purple-600 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Save Promise
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
