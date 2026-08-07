"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft, Phone, MessageSquare, MapPin, Hash, Plus, CreditCard, Loader2,
  ExternalLink, Receipt, Calendar, Settings2, CheckCircle2, AlertCircle, RefreshCw,
  Mail, MoreHorizontal, Wallet, TrendingUp, Hand, CalendarClock, IndianRupee,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/billzo/Button"
import { getDiceBearAvatarUrl } from "@/components/billzo/Avatar"
import { db } from "@/lib/billzo/db"
import { formatINR } from "@/lib/utils"
import { MerchantLanguage } from "@billzo/shared"
import { getCookie } from "@/lib/cookies"
import type { AutomationMode } from "@/lib/billzo/types"
import { scheduleBackgroundSync } from "@/lib/billzo/sync"
import { CustomerIntelligencePanel } from "@/components/billzo/CustomerIntelligencePanel"
import { RecoveryPlanCard, type RecoveryPlanData, type RecoveryPlanMode, type RecoveryPlanAction } from "@/components/billzo/RecoveryPlanCard"
import { PromiseModal } from "@/components/billzo/PromiseModal"
import { PaymentModal } from "@/components/billzo/PaymentModal"

const MODE_LABELS: Record<AutomationMode, string> = {
  full_auto: "Auto",
  manual: "Manual",
  muted: "Muted",
}

const MODE_COLORS: Record<AutomationMode, string> = {
  full_auto: "bg-success-soft text-success border-success",
  manual: "bg-warning-soft text-warning border-warning",
  muted: "bg-danger-soft text-danger border-danger",
}

const MODE_DOT_COLORS: Record<AutomationMode, string> = {
  full_auto: "bg-success",
  manual: "bg-warning",
  muted: "bg-danger",
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
  const [savingEdit, setSavingEdit] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', phone: '', whatsapp_number: '', gstin: '', email: '', address: '' })
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments'>('invoices')
  const [showPromiseModal, setShowPromiseModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  useEffect(() => { loadParty() }, [id])

  const loadParty = async () => {
    try {
      setLoading(true)
      setError(null)
      const tenantId = getCookie("bz_tenant")

      // 1. Primary server-side API fetch
      let serverData: any = null
      try {
        const res = await fetch(`/api/recovery/customer?customerId=${id}`, {
          credentials: "include",
        })
        if (res.ok) {
          serverData = await res.json()
        }
      } catch (e) {
        console.warn("Failed to fetch customer server data:", e)
      }

      // 2. Local Dexie fetch as fallback / supplement
      let localCust: any = null
      let localInvoices: any[] = []
      let localPayments: any[] = []
      try {
        localCust = await db().customers.get(id)
        if (tenantId) {
          const [invData, payData] = await Promise.all([
            db().invoices.where("tenantId").equals(tenantId).toArray(),
            db().payments?.where("tenantId").equals(tenantId).toArray() || Promise.resolve([]),
          ])
          localInvoices = invData.filter((inv: any) => inv.customerId === id || (inv as any).customer_id === id)
          localPayments = payData.filter((p: any) => localInvoices.some((inv: any) => inv.id === (p.invoiceId || p.invoice_id)))
        }
      } catch (e) {
        console.warn("Failed to fetch Dexie customer data:", e)
      }

      // If neither server nor local data has customer info
      if (!serverData?.customer && !localCust) {
        setError(MerchantLanguage.customer.notFound)
        return
      }

      // Normalize customer object
      const rawCust = serverData?.customer || localCust || {}
      const custName = rawCust.name || rawCust.customer_name || rawCust.customerName || 'Customer'
      const custPhone = rawCust.phone || rawCust.whatsapp_number || ''
      const custEmail = rawCust.email || ''
      const custGstin = rawCust.gstin || ''
      const custAddress = rawCust.address || rawCust.billing_address || ''
      const custAutomation = rawCust.automation_mode || rawCust.automationMode || localCust?.automationMode || 'full_auto'

      const normalizedCustomer = {
        id,
        name: custName,
        customer_name: custName,
        phone: custPhone,
        whatsapp_number: custPhone,
        email: custEmail,
        gstin: custGstin,
        address: custAddress,
        billing_address: custAddress,
        automationMode: custAutomation,
        automation_mode: custAutomation,
      }
      setCustomer(normalizedCustomer)

      // Normalize invoices
      let mergedInvoices: any[] = []
      if (serverData?.invoices && serverData.invoices.length > 0) {
        mergedInvoices = serverData.invoices.map((inv: any) => ({
          id: inv.id,
          invoiceNumber: inv.number || inv.invoice_number || `#${inv.id?.slice(-8)}`,
          total: Number(inv.total) || 0,
          status: inv.status || 'unpaid',
          dueDate: inv.dueDate || inv.due_date,
          createdAt: inv.createdAt || inv.created_at,
          paidAmount: inv.paidAmount || 0,
        }))
      } else if (localInvoices.length > 0) {
        mergedInvoices = localInvoices.map((inv: any) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber || inv.invoice_number || `#${inv.id?.slice(-8)}`,
          total: Number(inv.total) || Number(inv.grand_total) || 0,
          status: inv.status || 'unpaid',
          dueDate: inv.dueAt || inv.dueDate || inv.due_date,
          createdAt: inv.createdAt || inv.created_at,
          paidAmount: inv.paidAmount || 0,
        }))
      }
      setInvoices(mergedInvoices)

      // Normalize payments
      let mergedPayments: any[] = []
      if (serverData?.actions && serverData.actions.length > 0) {
        const serverPayments = (serverData.actions || [])
          .filter((a: any) => a.actionType === 'record_payment' || a.status === 'completed')
          .map((a: any) => ({
            id: a.id,
            amount: a.amount || 0,
            method: a.channel || 'Payment',
            createdAt: a.completedAt || a.scheduledAt,
            status: 'paid',
          }))
        mergedPayments = [...serverPayments]
      }
      if (localPayments.length > 0) {
        const localP = localPayments.map((p: any) => ({
          id: p.id,
          amount: Number(p.amount) || 0,
          method: p.method || p.provider || 'Payment',
          createdAt: p.createdAt || p.created_at,
          status: p.status || 'paid',
        }))
        const existingIds = new Set(mergedPayments.map(p => p.id))
        for (const p of localP) {
          if (!existingIds.has(p.id)) mergedPayments.push(p)
        }
      }
      setPayments(mergedPayments)
    } catch (err: any) {
      console.error("[PartyDetailPage] loadParty error:", err)
      setError(MerchantLanguage.error.loadFailed)
    } finally {
      setLoading(false)
    }
  }

  const totalInvoiced = invoices.reduce((s: number, i: any) => s + (Number(i.total) || 0), 0)
  const totalPaid = payments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0) +
    invoices.filter((i: any) => i.status === "paid").reduce((s: number, i: any) => s + (Number(i.paidAmount) || Number(i.total) || 0), 0)
  const pending = Math.max(0, totalInvoiced - totalPaid)
  // Include all non-paid and non-cancelled invoices (open, overdue, unpaid, partially_paid)
  const unpaidInvoices = invoices.filter((i: any) => i.status !== "paid" && i.status !== "cancelled")
  const hasPendingBalance = pending > 0 || unpaidInvoices.length > 0

  const handleSaveEdit = async () => {
    if (!customer) return
    setSavingEdit(true)
    const now = new Date().toISOString()
    const updatedName = editForm.name.trim() || customer.name
    const updatedPhone = editForm.phone.trim()
    const updatedEmail = editForm.email.trim()
    const updatedGstin = editForm.gstin.trim()
    const updatedAddress = editForm.address.trim()

    try {
      // 1. PATCH backend database
      const res = await fetch('/api/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: customer.id,
          name: updatedName,
          phone: updatedPhone,
          email: updatedEmail,
          gstin: updatedGstin,
          address: updatedAddress,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        toast.error(errData.error || 'Failed to update customer in backend')
      } else {
        toast.success('Customer profile updated')
      }
    } catch (e: any) {
      toast.error(e.message || 'Error updating customer')
    }

    // 2. Update local Dexie if available
    try {
      await db().customers.update(customer.id, {
        name: updatedName,
        phone: updatedPhone,
        whatsapp_number: editForm.whatsapp_number.trim() || updatedPhone,
        gstin: updatedGstin,
        email: updatedEmail,
        address: updatedAddress,
        updatedAt: now,
      })
    } catch (e) {
      // ignore dexie missing error
    }

    // 3. Update React state
    setCustomer((prev: any) => ({
      ...prev,
      name: updatedName,
      customer_name: updatedName,
      phone: updatedPhone,
      whatsapp_number: editForm.whatsapp_number.trim() || updatedPhone,
      email: updatedEmail,
      gstin: updatedGstin,
      address: updatedAddress,
      billing_address: updatedAddress,
      updatedAt: now,
    }))

    scheduleBackgroundSync()
    setSavingEdit(false)
    setEditing(false)
  }

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
      loadParty()
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
          <div className="bg-card border border-danger rounded-lg p-6 text-center">
            <AlertCircle className="w-8 h-8 text-danger mx-auto mb-3" />
            <p className="text-sm text-danger mb-4">{error}</p>
            <div className="flex justify-center gap-3">
              <Link href="/parties">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Customers
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={() => { setLoading(true); setError(null); loadParty() }}>
                <RefreshCw className="w-4 h-4 mr-1.5" /> {MerchantLanguage.common.retry}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Build recovery plan from state
  function buildRecoveryPlan(): RecoveryPlanData {
    const nextReminderInv = unpaidInvoices.find((i: any) => i.nextRecoveryAt)
    const promisedInv = invoices.find((i: any) => i.nextRecoveryAt && i.recoveryStage === 't0_soft')
    const lastReminderInv = [...invoices].sort((a: any, b: any) => new Date(b.lastReminderAt || 0).getTime() - new Date(a.lastReminderAt || 0).getTime())[0]

    let mode: RecoveryPlanMode = 'none'
    let modeLabel = 'Everything looks good'
    let executionAt: string | null = null
    let afterExecution = ''
    let status: RecoveryPlanData['status'] = 'completed'
    const nextAction: RecoveryPlanAction = { type: 'Nothing to do', at: null, isAutomatic: true, reason: 'No pending invoices' }
    const history: RecoveryPlanData['history'] = []

    if (pending > 0) {
      status = 'waiting'
      if (promisedInv) {
        mode = 'promise'
        modeLabel = 'Awaiting Promise'
        executionAt = promisedInv.nextRecoveryAt
        afterExecution = 'Mark as paid or resume recovery'
        nextAction.type = 'Wait for customer'
        nextAction.at = promisedInv.nextRecoveryAt
        nextAction.reason = 'Customer promised to pay'
        nextAction.isAutomatic = false
      } else if (nextReminderInv) {
        mode = 'scheduled_reminder'
        modeLabel = 'Scheduled Reminder'
        executionAt = nextReminderInv.nextRecoveryAt
        afterExecution = 'Auto follow-up resumes'
        nextAction.type = 'Send reminder'
        nextAction.at = nextReminderInv.nextRecoveryAt
        nextAction.reason = `${unpaidInvoices.length} invoice${unpaidInvoices.length > 1 ? 's' : ''} unpaid`
        nextAction.isAutomatic = true
      } else if (customer?.automationMode === 'muted') {
        mode = 'paused'
        modeLabel = 'Paused'
        afterExecution = 'Manual only'
        nextAction.type = 'Waiting'
        nextAction.reason = 'Paused by you'
        nextAction.isAutomatic = false
      } else {
        mode = 'auto_recovery'
        modeLabel = 'Auto follow-up'
        afterExecution = 'Managed automatically'
        nextAction.type = 'Waiting'
        nextAction.reason = `${formatINR(pending)} outstanding`
        nextAction.isAutomatic = true
      }
    }

    if (lastReminderInv?.lastReminderAt) {
      history.push({
        date: lastReminderInv.lastReminderAt,
        event: 'Reminder Sent',
        detail: lastReminderInv.lastWhatsAppStatus === 'read' ? 'Customer read the message' : 'Delivered to customer',
        reason: lastReminderInv.lastWhatsAppStatus === 'read' ? '' : 'No response yet',
        type: 'reminder',
      })
    }
    for (const p of payments.slice(0, 3)) {
      history.push({
        date: p.createdAt,
        event: 'Payment Received',
        detail: `${formatINR(p.amount)} received`,
        type: 'payment',
      })
    }

    return { mode, modeLabel, executionAt, afterExecution, status, nextAction, history }
  }

  const recoveryPlan = buildRecoveryPlan()

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
          {MerchantLanguage.customer.notFound} <Link href="/parties" className="text-foreground font-medium hover:underline">{MerchantLanguage.customer.backToCustomers}</Link>
        </div>
      </div>
    )
  }

  const transactions = [
    ...invoices.map((inv: any) => ({
      type: "invoice" as const,
      date: inv.createdAt || new Date().toISOString(),
      amount: inv.total || 0,
      label: `Invoice ${inv.invoiceNumber || `#${inv.id?.slice(-8)}`}`,
      status: inv.status || 'unpaid',
      id: inv.id,
    })),
    ...payments.map((pay: any) => ({
      type: "payment" as const,
      date: pay.createdAt || new Date().toISOString(),
      amount: pay.amount || 0,
      label: `Payment${pay.method ? ` via ${pay.method}` : ''}`,
      status: pay.status || 'paid',
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
          <ArrowLeft className="w-4 h-4" /> {MerchantLanguage.customer.allCustomers}
        </Link>

        {/* Party header */}
        <div className="bg-card border border-border rounded-lg p-4 lg:p-5">
          <div className="flex items-start gap-4">
            <img src={getDiceBearAvatarUrl(customer.name || 'Customer')} alt="" className="w-12 h-12 rounded-full shrink-0 bg-muted/20" />
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
                    onClick={() => {
                      setEditForm({
                        name: customer.name || '',
                        phone: customer.phone || '',
                        whatsapp_number: customer.whatsapp_number || customer.phone || '',
                        gstin: customer.gstin || '',
                        email: customer.email || '',
                        address: customer.address || customer.billing_address || ''
                      })
                      setEditing(true)
                    }}
                    className="text-xs text-muted-foreground font-medium shrink-0 hover:text-foreground"
                  >
                    {MerchantLanguage.action.edit}
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
                    <Button variant="outline" size="sm" onClick={() => setEditing(false)}>{MerchantLanguage.action.cancel}</Button>
                    <Button size="sm" onClick={handleSaveEdit} disabled={savingEdit}>
                      {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                      {MerchantLanguage.action.save}
                    </Button>
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

        {/* Quick Actions Bar — Primary operational controls */}
        <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5 px-1">Quick Recovery Actions</p>
          <div className="grid grid-cols-5 gap-2">
            <QuickAction
              icon={MessageSquare}
              label={MerchantLanguage.common.send}
              variant="emerald"
              onClick={() => {
                setSelectedInvoiceId(null)
                setEditingMessage(`Hello ${customer.name}, your pending amount of ${formatINR(pending)} is due. Please clear it at your earliest convenience.`)
                setShowWAModal(true)
              }}
              disabled={!hasPendingBalance || customer.automationMode === 'muted'}
            />
            <QuickAction
              icon={CalendarClock}
              label={MerchantLanguage.common.schedule}
              variant="indigo"
              onClick={() => {
                setSelectedInvoiceId(null)
                setEditingMessage(`Hello ${customer.name}, reminder for your upcoming payment of ${formatINR(pending)}.`)
                setShowWAModal(true)
              }}
              disabled={!hasPendingBalance}
            />
            <QuickAction
              icon={Hand}
              label={MerchantLanguage.payment.promise}
              variant="purple"
              onClick={() => setShowPromiseModal(true)}
              disabled={!hasPendingBalance}
            />
            <QuickAction
              icon={Wallet}
              label={MerchantLanguage.payment.recordPayment}
              variant="success"
              onClick={() => setShowPaymentModal(true)}
            />
            <QuickAction
              icon={Phone}
              label={MerchantLanguage.customer.call}
              variant="blue"
              onClick={() => {
                if (customer.phone) window.location.href = `tel:${customer.phone}`
              }}
              disabled={!customer.phone}
            />
          </div>
        </div>

        {/* Consolidated Financial & Recovery Overview */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
              <IndianRupee size={14} className="text-primary" />
              Financial & Recovery Summary
            </div>
            {pending > 0 ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-warning-soft text-warning border border-warning/30">
                {formatINR(pending)} Outstanding
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-success-soft text-success border border-success/30">
                All Clear · ₹0 Pending
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Lifetime Invoiced</p>
              <p className="text-base font-bold text-foreground tabular-nums">{formatINR(totalInvoiced)}</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Payments Received</p>
              <p className="text-base font-bold text-success tabular-nums">{formatINR(totalPaid)}</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Unpaid Invoices</p>
              <p className="text-base font-bold text-foreground tabular-nums">{unpaidInvoices.length}</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Oldest Overdue</p>
              <p className="text-base font-bold text-foreground tabular-nums">
                {(() => {
                  const oldest = unpaidInvoices.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
                  if (!oldest) return '—'
                  const days = Math.floor((Date.now() - new Date(oldest.createdAt).getTime()) / (1000 * 60 * 60 * 24))
                  return `${days} days`
                })()}
              </p>
            </div>
          </div>
        </div>

        {/* Recovery Plan */}
        <RecoveryPlanCard
          plan={recoveryPlan}
          onEdit={() => {
            setSelectedInvoiceId(null)
            setEditingMessage(`Hello ${customer.name}, your pending amount of ${formatINR(pending)} is due. Please clear it at your earliest convenience.`)
            setShowWAModal(true)
          }}
          onPause={() => setShowAutomationModal(true)}
        />

        {/* Recovery Intelligence */}
        <CustomerIntelligencePanel customerId={id} />

        {/* Success banner */}
        {waSuccess && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-success-soft border border-success">
            <span className="text-xs text-success font-medium">{MerchantLanguage.payment.reminderSent}</span>
          </div>
        )}

        {/* Manual mode notice */}
        {customer.automationMode === 'manual' && unpaidInvoices.length > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-warning-soft border border-warning">
            <Settings2 className="w-4 h-4 text-warning shrink-0" />
            <span className="text-xs text-warning font-medium">Manual mode — pending reminders need your approval before sending.</span>
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
            {MerchantLanguage.customer.invoices} ({invoices.length})
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'payments' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {MerchantLanguage.customer.payments} ({payments.length})
          </button>
        </div>

        {/* Transactions list */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {filteredTransactions.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {activeTab === 'invoices' ? MerchantLanguage.customer.noInvoicesYet : MerchantLanguage.customer.noPaymentsYet}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredTransactions.map((t, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      t.type === "invoice" ? "bg-muted text-muted-foreground" : "bg-success-soft text-success"
                    }`}>
                      {t.type === "invoice" ? <Receipt className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{t.label}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {new Date(t.date).toLocaleDateString()}
                        {t.type === "invoice" && (
                          <span className={`ml-1 capitalize ${
                            t.status === "paid" ? "text-success" :
                            t.status === "overdue" ? "text-danger" : "text-warning"
                          }`}>· {t.status}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-semibold tabular-nums ${t.type === "payment" ? "text-success" : "text-foreground"}`}>
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
                  {customer.phone ? MerchantLanguage.payment.sendReminder : 'Add phone number'}
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
                      <div className="p-3 rounded-lg bg-danger-soft border border-danger text-danger text-xs">{waError}</div>
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
                      <div className="p-3 rounded-lg bg-danger-soft border border-danger text-danger text-xs">{waError}</div>
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
                <h2 className="text-sm font-semibold text-foreground">Reminder settings</h2>
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

        {/* Promise Modal */}
        {showPromiseModal && customer && (
          <PromiseModal
            customerId={customer.id}
            customerName={customer.name}
            amount={pending}
            caseId={customer.id}
            onClose={() => setShowPromiseModal(false)}
            onSuccess={() => {
              setShowPromiseModal(false)
              toast.success("Promise to pay recorded")
              loadParty()
            }}
          />
        )}

        {/* Payment Modal */}
        {showPaymentModal && customer && (
          <PaymentModal
            customerId={customer.id}
            customerName={customer.name}
            amount={pending}
            openInvoiceCount={unpaidInvoices.length}
            caseId={customer.id}
            onClose={() => setShowPaymentModal(false)}
            onSuccess={() => {
              setShowPaymentModal(false)
              toast.success("Payment recorded")
              loadParty()
            }}
          />
        )}

      </div>
    </div>
  )
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  variant = 'default',
}: {
  icon: any
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'emerald' | 'indigo' | 'purple' | 'success' | 'blue' | 'default'
}) {
  const variantStyles: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 group-hover:bg-emerald-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 group-hover:bg-indigo-500/20',
    purple: 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 group-hover:bg-purple-500/20',
    success: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 group-hover:bg-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 group-hover:bg-blue-500/20',
    default: 'bg-muted text-muted-foreground group-hover:bg-muted/80',
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex flex-col items-center gap-1.5 p-2.5 rounded-xl text-center bg-card border border-border/60 shadow-sm hover:border-border hover:shadow-md transition-all active:scale-[0.97] disabled:opacity-35 disabled:pointer-events-none disabled:shadow-none"
    >
      <div className={`p-2.5 rounded-xl transition-colors ${variantStyles[variant]}`}>
        <Icon size={18} />
      </div>
      <span className="text-[11px] font-bold text-foreground leading-tight">{label}</span>
    </button>
  )
}
