"use client"

import { useState } from "react"
import { Phone, CheckCircle2, XCircle, HeartHandshake, Clock, Loader2, PhoneOff, PhoneMissed } from "lucide-react"
import { logRecoveryActivity } from "@/lib/billzo/recovery/activity"

interface CallCustomerProps {
  invoiceId: string
  customerPhone: string
  customerName: string
  onLogged?: () => void
}

const OUTCOMES = [
  { value: 'answered', label: 'Answered', icon: CheckCircle2 },
  { value: 'no_answer', label: "Didn't Answer", icon: PhoneMissed },
  { value: 'busy', label: 'Busy', icon: PhoneOff },
  { value: 'switched_off', label: 'Switched Off', icon: XCircle },
  { value: 'wrong_number', label: 'Wrong Number', icon: XCircle },
]

export function CallCustomer({ invoiceId, customerPhone, customerName, onLogged }: CallCustomerProps) {
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null)
  const [showPromiseFollowUp, setShowPromiseFollowUp] = useState(false)
  const [logging, setLogging] = useState(false)

  const handleCall = () => {
    logRecoveryActivity({
      invoiceId,
      type: 'merchant_called',
      actor: 'merchant',
      metadata: { customerName, customerPhone },
    })
    window.location.href = `tel:${customerPhone}`
    setShowFollowUp(true)
  }

  const logOutcome = async (outcome: string) => {
    setSelectedOutcome(outcome)
    setLogging(true)
    try {
      await logRecoveryActivity({
        invoiceId,
        type: 'call_outcome',
        actor: 'merchant',
        metadata: { outcome, customerName, customerPhone },
      })

      if (outcome === 'answered') {
        setShowPromiseFollowUp(true)
      } else {
        onLogged?.()
      }
    } catch {
    } finally {
      setLogging(false)
    }
  }

  const handlePromised = async () => {
    setLogging(true)
    try {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 7)
      await fetch('/api/recovery/promise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          dueDate: tomorrow.toISOString().slice(0, 10),
          note: `Promised during call on ${new Date().toLocaleDateString('en-IN')}`,
        }),
      })
      onLogged?.()
    } catch {
    } finally {
      setLogging(false)
      setShowPromiseFollowUp(false)
    }
  }

  const handlePaid = async () => {
    setLogging(true)
    try {
      await logRecoveryActivity({
        invoiceId,
        type: 'payment_confirmed',
        actor: 'merchant',
        metadata: { source: 'call' },
      })
      onLogged?.()
    } catch {
    } finally {
      setLogging(false)
      setShowPromiseFollowUp(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleCall}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all"
      >
        <Phone className="w-4 h-4" />
        Call {customerName}
      </button>

      {showFollowUp && !selectedOutcome && !showPromiseFollowUp && (
        <div className="rounded-xl border border-border p-3 space-y-2 bg-card">
          <p className="text-xs font-medium text-muted-foreground text-center">How did it go?</p>
          <div className="grid grid-cols-2 gap-1.5">
            {OUTCOMES.map((outcome) => {
              const Icon = outcome.icon
              return (
                <button
                  key={outcome.value}
                  onClick={() => logOutcome(outcome.value)}
                  disabled={logging}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {logging && selectedOutcome === outcome.value ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Icon className="w-3 h-3 text-muted-foreground" />
                  )}
                  {outcome.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {showPromiseFollowUp && (
        <div className="rounded-xl border border-border p-3 space-y-2 bg-card">
          <p className="text-xs font-medium text-muted-foreground text-center">Any outcome from the call?</p>
          <div className="flex gap-2">
            <button
              onClick={handlePromised}
              disabled={logging}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {logging ? <Loader2 className="w-3 h-3 animate-spin" /> : <HeartHandshake className="w-3 h-3 text-muted-foreground" />}
              Promised to Pay
            </button>
            <button
              onClick={handlePaid}
              disabled={logging}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {logging ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 text-muted-foreground" />}
              Paid
            </button>
            <button
              onClick={() => { setShowPromiseFollowUp(false); onLogged?.() }}
              disabled={logging}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Clock className="w-3 h-3" />
              Nothing
            </button>
          </div>
        </div>
      )}

      {selectedOutcome && !showPromiseFollowUp && !logging && (
        <div className="rounded-lg bg-success-soft p-2 text-xs text-success text-center font-medium">
          Call logged
        </div>
      )}
    </div>
  )
}
