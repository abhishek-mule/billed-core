'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  Zap,
  AlertTriangle,
  ShieldCheck,
  ArrowRight,
  Hourglass,
} from 'lucide-react'
import { useRazorpay } from '@/lib/billzo/useRazorpay'

interface CreditPacket {
  code: string
  credits: number
  pricePaise: number
  priceRupees: number
}

interface CreditsPayload {
  enabled: boolean
  balances: { included: number; purchased: number; available: number }
  currentPeriodEnd: string | null
  deferredCount: number
  deferredReason: string
  packets: CreditPacket[]
}

function fmtCredits(n: number): string {
  return n.toLocaleString('en-IN')
}

export function RecoveryCreditsPanel() {
  const { loaded, error: scriptError, openCheckout } = useRazorpay()
  const [data, setData] = useState<CreditsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [resuming, setResuming] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/recovery/credits', { credentials: 'include' })
      if (!res.ok) return
      const json = (await res.json()) as CreditsPayload
      if (json.enabled) setData(json)
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const refresh = useCallback(() => {
    setRefreshing(true)
    void load()
  }, [load])

  const resume = async () => {
    setResuming(true)
    try {
      const res = await fetch('/api/recovery/credits/resume', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Could not re-enable deferred reminders')
      }
      const json = (await res.json()) as { resumed: number }
      toast.success(
        json.resumed > 0
          ? `${json.resumed} deferred reminder${json.resumed === 1 ? '' : 's'} re-enabled`
          : 'Nothing deferred right now',
      )
      void refresh()
    } catch (e: any) {
      toast.error(e?.message || 'Could not re-enable deferred reminders')
    } finally {
      setResuming(false)
    }
  }

  if (loading) return null
  if (!data) return null

  const exhausted = data.balances.available <= 0
  const periodEndText = data.currentPeriodEnd
    ? new Date(data.currentPeriodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  const purchase = async (packet: CreditPacket) => {
    setPurchasing(packet.code)
    try {
      const orderRes = await fetch('/api/recovery/credits/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packetCode: packet.code }),
      })
      if (!orderRes.ok) {
        const err = await orderRes.json().catch(() => ({}))
        throw new Error(err.error || 'Could not create order')
      }
      const order = (await orderRes.json()) as {
        order_id: string
        amount: number
        currency?: string
        credits: number
        key_id?: string | null
      }

      await openCheckout({
        key_id: order.key_id || '',
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'BillZo',
        description: `${order.credits} recovery credits`,
        onSuccess: async (resp) => {
          try {
            const verifyRes = await fetch('/api/recovery/credits/verify', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              }),
            })
            if (!verifyRes.ok) {
              const err = await verifyRes.json().catch(() => ({}))
              toast.error(err.error || 'Could not verify payment — contact support')
              return
            }
            toast.success(`${order.credits} recovery credits added to your account`)
            void refresh()
          } catch {
            toast.error('Could not verify payment — contact support')
          }
        },
        onDismiss: () => toast.info('Purchase cancelled'),
        onError: (e) => toast.error(e?.description || 'Payment failed'),
      })
    } catch (e: any) {
      toast.error(e?.message || 'Could not start purchase')
    } finally {
      setPurchasing(null)
    }
  }

  return (
    <section className="rc-block rc-section rc-credits" aria-label="Recovery credits">
      <div className="rc-block-head">
        <span className="rc-dot rc-dot--blue" />
        <h2>Recovery credits</h2>
        <span className="rc-count rc-count--muted" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <ShieldCheck size={13} /> One credit = one successful automated action
        </span>
      </div>

      <div className="rc-credits-body">
        <div className="rc-credits-balances">
          <div className="rc-credits-bal">
            <span className="rc-credits-bal-label">INCLUDED THIS MONTH</span>
            <span className="rc-credits-bal-value">{fmtCredits(data.balances.included)}</span>
            {periodEndText ? (
              <span className="rc-credits-bal-note">Expires {periodEndText}</span>
            ) : null}
          </div>
          <div className="rc-credits-bal">
            <span className="rc-credits-bal-label">PURCHASED</span>
            <span className="rc-credits-bal-value">{fmtCredits(data.balances.purchased)}</span>
            <span className="rc-credits-bal-note">Never expires</span>
          </div>
          <div className={`rc-credits-bal rc-credits-bal--total ${exhausted ? 'rc-credits-bal--empty' : ''}`}>
            <span className="rc-credits-bal-label">AVAILABLE</span>
            <span className="rc-credits-bal-value">{fmtCredits(data.balances.available)}</span>
            <span className="rc-credits-bal-note">
              {exhausted ? 'Automation paused' : 'Ready to automate'}
            </span>
          </div>
        </div>

        {exhausted || data.deferredCount > 0 ? (
          <div className="rc-credits-warn">
            <AlertTriangle size={15} />
            <div>
              <strong>Automation is paused — no credits left.</strong>{' '}
              {data.deferredCount > 0 ? `${data.deferredCount} reminder${data.deferredCount === 1 ? '' : 's'} deferred until you re-enable them. ` : ''}
              Deferred reminders never auto-resume after a purchase — re-enable them here.
              <button
                className="rc-credits-resume"
                type="button"
                disabled={resuming}
                onClick={() => void resume()}
              >
                {resuming ? <Loader2 className="spin" size={13} /> : <ShieldCheck size={13} />}
                {data.deferredCount > 0 ? 'Re-enable deferred reminders' : 'Re-enable automation'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="rc-credits-packets">
          <span className="rc-credits-packets-label">
            <Hourglass size={13} /> TOP UP CREDITS
          </span>
          <div className="rc-credits-packet-row">
            {data.packets.map((p) => (
              <button
                key={p.code}
                className="rc-credits-packet"
                disabled={purchasing !== null || !loaded}
                onClick={() => purchase(p)}
                title={!loaded ? (scriptError || 'Loading payment gateway…') : `Buy ${p.credits} credits`}
              >
                {purchasing === p.code ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <Zap size={15} />
                )}
                <span className="rc-credits-packet-main">
                  <span className="rc-credits-packet-qty">{fmtCredits(p.credits)} credits</span>
                  <span className="rc-credits-packet-price">₹{p.priceRupees.toLocaleString('en-IN')}</span>
                </span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}