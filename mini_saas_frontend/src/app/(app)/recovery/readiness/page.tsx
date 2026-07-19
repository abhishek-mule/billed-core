"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  Store,
  MessageCircle,
  Users,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  PartyPopper,
} from "lucide-react"
import { trackEvent, events } from "@/lib/billzo/analytics"

type ReadinessAction = {
  kind: "add_customer" | "create_invoice" | "connect_whatsapp" | "send_reminder" | "healthy"
  title: string
  cta: string
  href: string
  overdueCount?: number
}

type Readiness = {
  customers: boolean
  invoices: boolean
  overdueInvoices: number
  whatsapp: boolean
  ready: boolean
  action: ReadinessAction
  customerCount: number
  invoiceCount: number
  recoverableAmount: number
}

function Check({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
  ) : (
    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
  )
}

function getTenant(): string {
  if (typeof document === "undefined") return "unknown"
  const m = document.cookie.match(/(?:^| )bz_tenant=([^;]+)/)
  return m ? decodeURIComponent(m[2]) : "unknown"
}

export default function RecoveryReadinessPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Readiness | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/recovery/readiness", { credentials: "include" })
      if (!res.ok) throw new Error("Could not load readiness")
      setData((await res.json()) as Readiness)
    } catch (e: any) {
      setError(e.message || "Something went wrong")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onAction = useCallback(() => {
    if (!data) return
    const a = data.action
    if (a.kind === "send_reminder") trackEvent(getTenant(), events.queue_completed, { source: "readiness" })
    if (a.kind === "healthy") {
      router.push("/recovery")
      return
    }
    router.push(a.href)
  }, [data, router])

  if (loading) {
    return (
      <div className="min-h-[70vh] grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-[70vh] grid place-items-center p-4">
        <div className="text-center">
          <p className="text-sm text-destructive">{error || "Not available"}</p>
          <button onClick={load} className="mt-3 text-sm text-primary underline">
            Retry
          </button>
        </div>
      </div>
    )
  }

  const rows = [
    { ok: true, icon: <Store className="h-4 w-4" />, label: "Business profile" },
    { ok: data.whatsapp, icon: <MessageCircle className="h-4 w-4" />, label: data.whatsapp ? "WhatsApp connected" : "WhatsApp not connected" },
    {
      ok: data.customers,
      icon: <Users className="h-4 w-4" />,
      label: data.customers ? `${data.customerCount} customer${data.customerCount === 1 ? "" : "s"}` : "No customers yet",
    },
    {
      ok: data.invoices,
      icon: <FileText className="h-4 w-4" />,
      label: data.invoices ? `${data.invoiceCount} invoice${data.invoiceCount === 1 ? "" : "s"}` : "No invoices yet",
    },
  ]

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <PartyPopper className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-foreground">Recovery Readiness</h1>
        <p className="mt-1 text-sm text-muted-foreground">One step at a time. Here&apos;s where you are.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm divide-y divide-border">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Check ok={r.ok} />
            <span className={`grid h-8 w-8 place-items-center rounded-lg ${r.ok ? "bg-success/10" : "bg-amber-500/10"}`}>
              {r.icon}
            </span>
            <span className="text-sm font-medium text-foreground">{r.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/70">Next step</p>
        <p className="mt-1.5 text-base font-semibold text-foreground">{data.action.title}</p>

        {data.action.kind === "send_reminder" && (
          <p className="mt-1 text-sm text-muted-foreground">
            Ready to recover <span className="font-semibold text-foreground">₹{data.recoverableAmount.toLocaleString("en-IN")}</span>
          </p>
        )}

        <button
          onClick={onAction}
          className="mt-4 w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
        >
          {data.action.cta}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {data.action.kind === "healthy" && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          BillZo is watching your invoices. You&apos;ll see a reminder action here when one goes overdue.
        </p>
      )}
    </div>
  )
}
