"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft, Phone, MessageSquare, MapPin, Hash, Plus, CreditCard, Loader2,
  ExternalLink, Receipt, Calendar, Settings2, CheckCircle2, AlertCircle, RefreshCw,
  Mail, MoreHorizontal, Wallet, TrendingUp,
} from "lucide-react"
import { Button } from "@/components/billzo/Button"
import { db } from "@/lib/billzo/db"

import { formatINR } from "@/lib/utils"
import { getCookie } from "@/lib/cookies"
import type { AutomationMode } from "@/lib/billzo/types"
import { scheduleBackgroundSync } from "@/lib/billzo/sync"
import { CustomerIntelligencePanel } from "@/components/billzo/CustomerIntelligencePanel"

const MODE_LABELS: Record<AutomationMode, string> = {
  full_auto: "Auto",
  manual: "Manual",
  muted: "Muted",
}

const MODE_COLORS: Record<AutomationMode, string> = {
  full_auto: "bg-emerald-50 text-emerald-700 border-emerald-200",
  manual: "bg-amber-50 text-amber-700 border-amber-200",
  muted: "bg-rose-50 text-rose-700 border-rose-200",
}

const MODE_DOT_COLORS: Record<AutomationMode, string> = {
  full_auto: "bg-emerald-500",
  manual: "bg-amber-500",
  muted: "bg-rose-500",
}

export default function PartyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [customer, setCustomer] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sendingWA, setSendingWA] = useState(false)
  const [waSuccess, setWaSuccess] = useState(false)
  const [waError, setWaError] = useState("")
  const [showWAModal, setShowWAModal] = useState(false)
  const [personalNote, setPersonalNote] = useState("")
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [showAutomationModal, setShowAutomationModal] = useState(false)
  const [updatingAutomation, setUpdatingAutomation] = useState(false)
  const [editingMessage, setEditingMessage] = useState("")
  const [missingPhone, setMissingPhone] = useState("")
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', phone: '', whatsapp_number: '', gstin: '', email: '', address: '' })
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments'>('invoices')

  useEffect(() => { loadParty() }, [id])

  const loadParty = async () => {
    try {
      setError(null)
      const tenantId = getCookie("bz_tenant")
      if (!tenantId) { router.push("/auth"); return }

      const cust = await db().customers.get(id)
      if (!cust) { router.push("/parties"); return }
      setCustomer(cust)

      const [invData, payData] = await Promise.all([
        db().invoices.where("tenantId").equals(tenantId).toArray(),
        db().payments?.where("tenantId").equals(tenantId).toArray() || Promise.resolve([]),
      ])

      const customerInvoices = invData
        .filter((inv: any) => inv.customerId === id || (inv as any).customer_id === id)
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setInvoices(customerInvoices)

      const customerPayments = payData
        .filter((p: any) => customerInvoices.some((inv: any) => inv.id === (p.invoiceId || p.invoice_id)))
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setPayments(customerPayments)
    } catch (err) {
      setError("Failed to load party details")
    } finally {
      setLoading(false)
    }
  }

  const totalInvoiced = invoices.reduce((s: number, i: any) => s + (i.total || 0), 0)
  const totalPaid = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0) +
    invoices.filter((i: any) => i.status === "paid").reduce((s: number, i: any) => s + (i.paidAmount || 0), 0)
  const pending = totalInvoiced - totalPaid
  const unpaidInvoices = invoices.filter((i: any) => i.status === "unpaid" || i.status === "overdue")

  const sendReminder = async (invoiceId?: string, phoneOverride?: string) => {
    const tenantId = getCookie("bz_tenant")
    if (!tenantId || !customer) return
    const phone = phoneOverride || customer.phone
    if (!phone) return

    setSendingWA(true)
    setWaError("")
    try {
      const targetInvoice = invoiceId ? invoices.find((i: any) => i.id === invoiceId) : unpaidInvoices[0]
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customerId: customer.id,
          customerPhone: phone,
          invoiceId: targetInvoice?.id,
          templateKey: targetInvoice?.status === "paid" ? "receipt" : "udharGentle",
          vars: {
            "1": customer.name,
            "2": formatINR(targetInvoice?.total || pending),
            "3": targetInvoice?.id?.slice(-8) || "",
            "4": targetInvoice?.paymentLinkUrl || "",
          },
          message: editingMessage.trim() || undefined,
          personalNote: personalNote.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to send")
      setWaSuccess(true)
      setShowWAModal(false)
      setMissingPhone("")
      setPersonalNote("")
      setTimeout(() => setWaSuccess(false), 3000)
    } catch (err: any) {
      setWaError(err.message)
    } finally {
      setSendingWA(false)
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8">
          <div className="bg-card border border-rose-200 rounded-lg p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
            <p className="text-sm text-rose-600 mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={() => { setLoading(true); setError(null); loadParty() }}>
              <RefreshCw className="w-4 h-4 mr-1.5" /> Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">
          <div className="h-7 w-32 bg-muted rounded animate-pulse" />
          <div className="h-28 bg-card border border-border rounded-lg animate-pulse" />
          <div className="grid grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-card border border-border rounded-lg animate-pulse" />)}
          </div>
          <div className="h-10 bg-card border border-border rounded-lg animate-pulse" />
          <div className="h-64 bg-card border border-border rounded-lg animate-pulse" />
        </div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-muted/50 pb-8">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8 text-center text-sm text-muted-foreground">
          Party not found. <Link href="/parties" className="text-foreground font-medium hover:underline">Back to parties</Link>
        </div>
      </div>
    )
  }

  const transactions = [
    ...invoices.map((inv: any) => ({
      type: "invoice" as const,
      date: inv.createdAt,
      amount: inv.total,
      label: `Invoice ${inv.invoiceNumber || `#${inv.id?.slice(-8)}`}`,
      status: inv.status,
      id: inv.id,
    })),
    ...payments.map((pay: any) => ({
      type: "payment" as const,
      date: pay.createdAt,
      amount: pay.amount,
      label: `Payment${pay.method ? ` via ${pay.method}` : ''}`,
      status: pay.status,
      id: pay.id,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const filteredTransactions = transactions.filter(t =>
    activeTab === 'invoices' ? t.type === 'invoice' : t.type === 'payment'
  )

  return (
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">

        {/* Back link */}
        <Link href="/parties" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> All parties
        </Link>

        {/* Party header */}
        <div className="bg-card border border-border rounded-lg p-4 lg:p-5">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ${
              pending > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
            }`}>
              {customer.name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {editing ? (
                  <input
                    value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className="text-lg font-semibold bg-transparent border-b border-border focus:outline-none focus:border-primary flex-1 text-foreground"
                  />
                ) : (
                  <h1 className="text-lg font-semibold text-foreground truncate">{customer.name}</h1>
                )}
                <button
                  onClick={() => setShowAutomationModal(true)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border shrink-0 ${MODE_COLORS[(customer.automationMode || 'full_auto') as AutomationMode]} hover:opacity-80`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${MODE_DOT_COLORS[(customer.automationMode || 'full_auto') as AutomationMode]}`} />
                  {MODE_LABELS[(customer.automationMode || 'full_auto') as AutomationMode]}
                </button>
                {!editing && (
                  <button
                    onClick={() => { setEditForm({
                      name: customer.name, phone: customer.phone || '', whatsapp_number: customer.whatsapp_number || '',
                      gstin: customer.gstin || '', email: customer.email || '', address: customer.address || ''
                    }); setEditing(true) }}
                    className="text-xs text-muted-foreground font-medium shrink-0 hover:text-foreground"
                  >
                    Edit
                  </button>
                )}
              </div>
              {editing ? (
                <div className="mt-3 space-y-2">
                  {[
                    { key: 'phone', label: 'Phone', icon: Phone, type: 'tel', placeholder: '+91 98765 43210' },
                    { key: 'whatsapp_number', label: 'WhatsApp', icon: MessageSquare, type: 'tel', placeholder: '+91 98765 43210' },
                    { key: 'email', label: 'Email', icon: Mail, type: 'email', placeholder: 'customer@example.com' },
                    { key: 'gstin', label: 'GSTIN', icon: Hash, type: 'text', placeholder: '29AAACP1234C1Z5' },
                    { key: 'address', label: 'Address', icon: MapPin, type: 'text', placeholder: 'Full address' },
                  ].map(field => (
                    <div key={field.key} className="flex items-center gap-2">
                      <field.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <input
                        value={(editForm as any)[field.key]}
                        onChange={e => setEditForm(f => ({ ...f, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        type={field.type}
                        className="flex-1 bg-transparent text-sm border-b border-dotted border-border focus:outline-none focus:border-primary placeholder:text-muted-foreground text-foreground"
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button size="sm" onClick={async () => {
                      const now = new Date().toISOString()
                      await db().customers.update(customer.id, { ...editForm, updatedAt: now })
                      setCustomer({ ...customer, ...editForm, updatedAt: now })
                      scheduleBackgroundSync()
                      setEditing(false)
                    }}>Save</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {customer.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5" /> {customer.phone}
                    </div>
                  )}
                  {customer.gstin && (
                    <div className="flex items-center gap-2">
                      <Hash className="w-3.5 h-3.5" /> {customer.gstin}
                    </div>
                  )}
                  {customer.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5" /> {customer.email}
                    </div>
                  )}
                  {customer.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5" /> {customer.address}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Financial summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Total Invoiced</p>
            <p className="text-base font-semibold text-foreground tabular-nums">{formatINR(totalInvoiced)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Total Paid</p>
            <p className="text-base font-semibold text-emerald-600 tabular-nums">{formatINR(totalPaid)}</p>
          </div>
          <div className={`bg-card border rounded-lg p-3 ${pending > 0 ? 'border-amber-200 bg-amber-50/30' : 'border-border'}`}>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Pending</p>
            <p className={`text-base font-semibold tabular-nums ${pending > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>
              {formatINR(pending)}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setSelectedInvoiceId(null)
              setEditingMessage(`Hello ${customer.name}, your pending amount of ${formatINR(pending)} is due. Please clear it at your earliest convenience.`)
              setShowWAModal(true)
            }}
            disabled={unpaidInvoices.length === 0 || customer.automationMode === 'muted'}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50 bg-foreground text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
          >
            <MessageSquare className="w-4 h-4" />
            {customer.automationMode === 'muted' ? 'Reminders Paused' : 'Send Reminder'}
          </button>
          <button
            onClick={() => router.push(`/pos?customerId=${id}`)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium border border-border text-foreground hover:bg-muted"
          >
            <Plus className="w-4 h-4" />
            New Invoice
          </button>
          <button
            onClick={() => router.push(`/pulse?payInvoice=${id}`)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          >
            <Wallet className="w-4 h-4" />
            Record Payment
          </button>
        </div>

        {/* Recovery Intelligence */}
        <CustomerIntelligencePanel customerId={id} />

        {/* Success banner */}
        {waSuccess && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
            <span className="text-xs text-emerald-700 font-medium">Reminder sent via WhatsApp!</span>
          </div>
        )}

        {/* Manual mode notice */}
        {customer.automationMode === 'manual' && unpaidInvoices.length > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <Settings2 className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-xs text-amber-700 font-medium">Manual mode — pending reminders need your approval before sending.</span>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'invoices' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Invoices ({invoices.length})
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'payments' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Payments ({payments.length})
          </button>
        </div>

        {/* Transactions list */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {filteredTransactions.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {activeTab === 'invoices' ? 'No invoices yet' : 'No payments yet'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredTransactions.map((t, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      t.type === "invoice" ? "bg-muted text-muted-foreground" : "bg-emerald-50 text-emerald-600"
                    }`}>
                      {t.type === "invoice" ? <Receipt className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{t.label}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {new Date(t.date).toLocaleDateString()}
                        {t.type === "invoice" && (
                          <span className={`ml-1 capitalize ${
                            t.status === "paid" ? "text-emerald-600" :
                            t.status === "overdue" ? "text-rose-600" : "text-amber-600"
                          }`}>· {t.status}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-semibold tabular-nums ${t.type === "payment" ? "text-emerald-600" : "text-foreground"}`}>
                      {t.type === "payment" ? "+" : ""}{formatINR(t.amount)}
                    </span>
                    {t.type === "invoice" && t.id && (
                      <Link href={`/invoices/${t.id}`} className="p-1 rounded hover:bg-muted">
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* WhatsApp Modal */}
        {showWAModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="w-full max-w-lg bg-card border border-border rounded-lg shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">
                  {customer.phone ? 'Send WhatsApp Reminder' : 'Add phone number'}
                </h2>
                <button onClick={() => { setShowWAModal(false); setWaError(""); setEditingMessage(""); setMissingPhone("") }} className="p-1 rounded hover:bg-muted">
                  <span className="text-muted-foreground text-lg leading-none">×</span>
                </button>
              </div>
              {customer.phone ? (
                <>
                  <div className="p-4 space-y-4">
                    {unpaidInvoices.length > 1 && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Select Invoice</label>
                        <select
                          value={selectedInvoiceId || ""}
                          onChange={(e) => {
                            setSelectedInvoiceId(e.target.value || null)
                            const inv = invoices.find((i: any) => i.id === e.target.value)
                            setEditingMessage(`Hello ${customer.name}, your pending amount of ${formatINR(inv?.total || pending)} is due. Please clear it at your earliest convenience.`)
                          }}
                          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                        >
                          <option value="">All unpaid invoices ({formatINR(pending)})</option>
                          {unpaidInvoices.map((inv: any) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.invoiceNumber || `#${inv.id?.slice(-8)}`} — {formatINR(inv.total)} ({inv.status})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Message Preview</label>
                      <textarea
                        value={editingMessage}
                        onChange={(e) => setEditingMessage(e.target.value)}
                        rows={4}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary resize-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Personal Note (optional)</label>
                      <textarea
                        value={personalNote}
                        onChange={(e) => setPersonalNote(e.target.value)}
                        rows={2}
                        placeholder="Add a personal note..."
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
                      />
                    </div>
                    {waError && (
                      <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">{waError}</div>
                    )}
                  </div>
                  <div className="flex gap-3 px-4 py-3 border-t border-border bg-muted">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowWAModal(false); setWaError(""); setEditingMessage("") }}>
                      Cancel
                    </Button>
                    <Button size="sm" className="flex-1" onClick={() => sendReminder(selectedInvoiceId || undefined)} disabled={sendingWA}>
                      {sendingWA ? 'Sending...' : 'Send Reminder'}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Customer Phone</label>
                      <input
                        value={missingPhone}
                        onChange={e => setMissingPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        type="tel"
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">A phone number is required to send WhatsApp reminders. This will be saved to the customer profile.</p>
                    {waError && (
                      <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">{waError}</div>
                    )}
                  </div>
                  <div className="flex gap-3 px-4 py-3 border-t border-border bg-muted">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowWAModal(false); setWaError(""); setEditingMessage(""); setMissingPhone("") }}>
                      Cancel
                    </Button>
                    <Button size="sm" className="flex-1" onClick={async () => {
                      const phone = missingPhone.trim()
                      if (!phone) return
                      await db().customers.update(customer.id, { phone, updatedAt: new Date().toISOString() })
                      setCustomer({ ...customer, phone })
                      scheduleBackgroundSync()
                      sendReminder(selectedInvoiceId || undefined, phone)
                    }} disabled={sendingWA || !missingPhone.trim()}>
                      {sendingWA ? 'Saving & Sending...' : 'Save Phone & Send'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Automation modal */}
        {showAutomationModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="w-full max-w-sm bg-card border border-border rounded-lg shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">Reminder Settings</h2>
                <button onClick={() => setShowAutomationModal(false)} className="p-1 rounded hover:bg-muted">
                  <span className="text-muted-foreground text-lg leading-none">×</span>
                </button>
              </div>
              <div className="p-4 space-y-2">
                {(['full_auto', 'manual', 'muted'] as AutomationMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={async () => {
                      if (updatingAutomation) return
                      setUpdatingAutomation(true)
                      try {
                        const res = await fetch('/api/parties/automation', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ customerId: customer.id, mode: m }),
                        })
                        if (!res.ok) throw new Error('Failed to update')
                        await db().customers.update(customer.id, { automationMode: m })
                        setCustomer({ ...customer, automationMode: m })
                        setShowAutomationModal(false)
                      } catch (err: any) {
                        console.error('Failed to update automation mode:', err)
                      } finally {
                        setUpdatingAutomation(false)
                      }
                    }}
                    disabled={updatingAutomation}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      (customer.automationMode || 'full_auto') === m
                        ? 'border-foreground bg-muted'
                        : 'border-border bg-card hover:border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${MODE_DOT_COLORS[m]}`} />
                        <span className="text-sm font-medium text-foreground">{MODE_LABELS[m]}</span>
                      </div>
                      {(customer.automationMode || 'full_auto') === m && (
                        <CheckCircle2 className="w-4 h-4 text-foreground" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground ml-4">
                      {m === 'full_auto' ? 'BillZo sends reminders automatically' :
                       m === 'manual' ? 'I approve each reminder before sending' :
                       'No reminders for this customer'}
                    </p>
                  </button>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-border bg-muted rounded-b-lg">
                <p className="text-xs text-muted-foreground">Changes take effect immediately.</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
