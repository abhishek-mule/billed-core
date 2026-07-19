"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronLeft, Bug, Search, CheckCircle2, Circle, Clock, Phone, MessageSquare } from "lucide-react"
import { Button } from "@/components/billzo/Button"

interface ActionRow {
  id: string
  action_type: string
  status: string
  scheduled_at: string
  channel: string
  template_name: string | null
  trigger_type: string | null
}
interface LifecycleEvent {
  action_id: string
  event_type: string
  from_status: string | null
  to_status: string | null
  payload: any
  created_at: string
}
interface Diagnostics {
  invoice: { id: string; status: string; total: any; outstanding: any; dueDate: string | null; createdAt: string; customerId: string | null }
  policy: { id: string; name: string; steps: any[] } | null
  actions: ActionRow[]
  lifecycle: LifecycleEvent[]
  nextAction: { id: string; action_type: string; scheduled_at: string; status: string } | null
}

export default function RecoveryDiagnosticsPage() {
  const [invoiceId, setInvoiceId] = useState("")
  const [data, setData] = useState<Diagnostics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (!invoiceId.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/recovery/diagnostics?invoiceId=${encodeURIComponent(invoiceId.trim())}`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setData(json)
    } catch (e: any) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="max-w-3xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-5">
        <Link href="/settings/developer" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to Developer
        </Link>

        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5 text-info" />
          <h1 className="text-lg font-semibold text-foreground">Recovery Diagnostics</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Developer tool — inspect how the recovery workflow engine processed a single invoice.
        </p>

        <div className="flex gap-2">
          <input
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="Enter Invoice ID"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <Button onClick={run} disabled={loading}>
            <Search className="w-4 h-4 mr-1" /> {loading ? "Loading…" : "Diagnose"}
          </Button>
        </div>

        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        {data && (
          <div className="space-y-5">
            {/* Invoice */}
            <Section title="Invoice">
              <Row k="Invoice ID" v={data.invoice.id} />
              <Row k="Status" v={data.invoice.status} />
              <Row k="Total" v={`₹${Number(data.invoice.total || 0).toLocaleString("en-IN")}`} />
              <Row k="Outstanding" v={`₹${Number(data.invoice.outstanding || 0).toLocaleString("en-IN")}`} />
              <Row k="Due Date" v={data.invoice.dueDate ? new Date(data.invoice.dueDate).toLocaleString() : "—"} />
              <Row k="Created" v={new Date(data.invoice.createdAt).toLocaleString()} />
            </Section>

            {/* Policy */}
            <Section title="Current Policy">
              {data.policy ? (
                <>
                  <Row k="Policy" v={data.policy.name} />
                  <div className="mt-2 space-y-1">
                    {data.policy.steps.map((s: any) => (
                      <div key={s.sequence} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="w-12 text-foreground font-mono">D+{s.offset_days}</span>
                        <span className="capitalize">{s.action_type}</span>
                        <span>·</span>
                        <span className="capitalize">{s.channel}</span>
                        {s.template_name && <span className="opacity-70">({s.template_name})</span>}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No default policy set — Standard fallback applies.</p>
              )}
            </Section>

            {/* Generated Actions */}
            <Section title="Generated Actions">
              {data.actions.length === 0 ? (
                <p className="text-sm text-warning">No collection actions generated yet. Planner may not have run (check invoice.created wiring).</p>
              ) : (
                <ul className="space-y-2">
                  {data.actions.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
                      <ActionIcon type={a.action_type} channel={a.channel} />
                      <div className="flex-1">
                        <div className="text-sm font-medium capitalize text-foreground">
                          {a.action_type} {a.channel === "phone" && <span className="text-muted-foreground">· call</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {a.trigger_type} · scheduled {new Date(a.scheduled_at).toLocaleString()}
                        </div>
                      </div>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* Timeline */}
            <Section title="Timeline">
              {data.lifecycle.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lifecycle events recorded.</p>
              ) : (
                <ol className="relative border-l border-border ml-2 space-y-3 pl-4">
                  {data.lifecycle.map((e, i) => (
                    <li key={i} className="text-sm">
                      <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-primary" />
                      <span className="text-foreground font-medium">{e.event_type}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        {e.from_status && e.to_status ? `(${e.from_status} → ${e.to_status})` : ""} · {new Date(e.created_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            {/* Next Action */}
            <Section title="Next Scheduled Action">
              {data.nextAction ? (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-info" />
                  <span className="capitalize text-foreground">{data.nextAction.action_type}</span>
                  <span className="text-muted-foreground">at {new Date(data.nextAction.scheduled_at).toLocaleString()}</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No pending scheduled actions.</p>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  )
}

function ChevonLeft({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">{title}</h2>
      {children}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-foreground font-medium break-all text-right">{v}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    completed: { cls: "text-success", icon: <CheckCircle2 className="w-4 h-4" /> },
    in_progress: { cls: "text-info", icon: <Circle className="w-4 h-4 animate-pulse" /> },
    scheduled: { cls: "text-muted-foreground", icon: <Clock className="w-4 h-4" /> },
    cancelled: { cls: "text-warning", icon: <Circle className="w-4 h-4" /> },
    failed: { cls: "text-destructive", icon: <Circle className="w-4 h-4" /> },
  }
  const s = map[status] || map.scheduled
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium capitalize ${s.cls}`}>
      {s.icon} {status.replace("_", " ")}
    </span>
  )
}

function ActionIcon({ type, channel }: { type: string; channel: string }) {
  if (channel === "phone" || type === "call") return <Phone className="w-4 h-4 text-info" />
  return <MessageSquare className="w-4 h-4 text-info" />
}
