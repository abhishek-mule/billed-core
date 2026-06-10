"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Phone, Mail, MapPin, Hash, MessageCircle, Plus, CreditCard, Loader2, ExternalLink, Receipt, Calendar, TrendingUp, TrendingDown, Settings2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/billzo/Button";
import { db } from "@/lib/billzo/db";
import { getUsageLimits, incrementReminderCount } from "@/lib/billzo/usage";
import { PaywallModal } from "@/components/billzo/PaywallModal";
import { formatINR } from "@/lib/utils";
import { getCookie } from "@/lib/cookies";
import type { AutomationMode } from "@/lib/billzo/types";
import { scheduleBackgroundSync } from "@/lib/billzo/sync";

const MODE_LABELS: Record<AutomationMode, string> = {
  full_auto: "Auto",
  manual: "Manual",
  muted: "Muted",
}

const MODE_COLORS: Record<AutomationMode, string> = {
  full_auto: "bg-green-100 text-green-700 border-green-200",
  manual: "bg-yellow-100 text-yellow-700 border-yellow-200",
  muted: "bg-red-100 text-red-700 border-red-200",
}

const MODE_DOT_COLORS: Record<AutomationMode, string> = {
  full_auto: "bg-green-500",
  manual: "bg-yellow-500",
  muted: "bg-red-500",
}

const MODE_DESCRIPTIONS: Record<AutomationMode, string> = {
  full_auto: "BillZo sends reminders automatically",
  manual: "I approve each reminder before sending",
  muted: "No reminders for this customer",
}

export default function PartyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [customer, setCustomer] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingWA, setSendingWA] = useState(false);
  const [waSuccess, setWaSuccess] = useState(false);
  const [waError, setWaError] = useState("");
  const [showPaywall, setShowPaywall] = useState(false);
  const [usageLimits, setUsageLimits] = useState<any>(null);
  const [showWAModal, setShowWAModal] = useState(false);
  const [personalNote, setPersonalNote] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [updatingAutomation, setUpdatingAutomation] = useState(false);
  const [editingMessage, setEditingMessage] = useState("");
  const [missingPhone, setMissingPhone] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', whatsapp_number: '', gstin: '', email: '', address: '' });

  useEffect(() => {
    loadParty();
  }, [id]);

  const loadParty = async () => {
    try {
      const tenantId = getCookie("bz_tenant");
      if (!tenantId) {
        router.push("/auth");
        return;
      }

      const cust = await db().customers.get(id);
      if (!cust) {
        router.push("/parties");
        return;
      }
      setCustomer(cust);

      const [invData, payData, usage] = await Promise.all([
        db().invoices.where("tenantId").equals(tenantId).toArray(),
        db().payments.where("tenantId").equals(tenantId).toArray(),
        getUsageLimits(tenantId),
      ]);

      const customerInvoices = invData.filter((inv) => inv.customerId === id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setInvoices(customerInvoices);

      const customerPayments = payData.filter((p) => {
        if (p.invoiceId) {
          return customerInvoices.some((inv) => inv.id === p.invoiceId);
        }
        return false;
      }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPayments(customerPayments);
      setUsageLimits(usage);
    } catch (error) {
      console.error("Failed to load party:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalInvoiced = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0) + invoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.paidAmount || 0), 0);
  const pending = totalInvoiced - totalPaid;
  const unpaidInvoices = invoices.filter((i) => i.status === "unpaid" || i.status === "overdue");

  const sendReminder = async (invoiceId?: string, phoneOverride?: string) => {
    const tenantId = getCookie("bz_tenant");
    if (!tenantId || !customer) return;

    const phone = phoneOverride || customer.phone;
    if (!phone) return;

    const limits = await getUsageLimits(tenantId);
    if (!limits.canSendReminder) {
      setShowPaywall(true);
      return;
    }

    setSendingWA(true);
    setWaError("");
    try {
      const targetInvoice = invoiceId ? invoices.find((i) => i.id === invoiceId) : unpaidInvoices[0];
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customerId: customer.id,
          customerPhone: phone,
          invoiceId: targetInvoice?.id,
          templateKey: targetInvoice ? (targetInvoice.status === "paid" ? "receipt" : "invoice") : "udharGentle",
          vars: {
            "1": customer.name,
            "2": formatINR(targetInvoice?.total || pending),
            "3": targetInvoice?.id?.slice(-8) || "",
            "4": targetInvoice?.paymentLinkUrl || "",
          },
          message: editingMessage.trim() || undefined,
          personalNote: personalNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      await incrementReminderCount(tenantId);
      setWaSuccess(true);
      setShowWAModal(false);
      setMissingPhone("");
      setPersonalNote("");
      setTimeout(() => setWaSuccess(false), 3000);
    } catch (err: any) {
      setWaError(err.message);
    } finally {
      setSendingWA(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="px-4 py-12 text-center text-sm text-muted-foreground">
        Party not found.{" "}
        <Link href="/parties" className="text-primary font-medium">
          Back to parties
        </Link>
      </div>
    );
  }

  const transactions = [
    ...invoices.map((inv) => ({
      type: "invoice" as const,
      date: inv.createdAt,
      amount: inv.total,
      label: `Invoice #${inv.id?.slice(-8)}`,
      status: inv.status,
      id: inv.id,
    })),
    ...payments.map((pay) => ({
      type: "payment" as const,
      date: pay.createdAt,
      amount: pay.amount,
      label: `Payment via ${pay.provider}`,
      status: pay.status,
      id: pay.id,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-4xl mx-auto space-y-5">
      <Link href="/parties" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All parties
      </Link>

      <div className="rounded-2xl border border-border bg-card p-5 lg:p-6">
        <div className="flex items-start gap-4">
          <div className={`grid h-14 w-14 place-items-center rounded-full text-xl font-bold shrink-0 ${pending > 0 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
            {customer.name?.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {editing ? (
                <input
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="text-xl font-bold bg-transparent border-b border-primary/30 focus:outline-none focus:border-primary flex-1"
                />
              ) : (
                <h1 className="text-xl font-bold truncate">{customer.name}</h1>
              )}
              <button
                onClick={() => setShowAutomationModal(true)}
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${MODE_COLORS[(customer.automationMode || 'full_auto') as AutomationMode]} hover:opacity-80 transition-opacity`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${MODE_DOT_COLORS[(customer.automationMode || 'full_auto') as AutomationMode]}`} />
                {MODE_LABELS[(customer.automationMode || 'full_auto') as AutomationMode]}
              </button>
              {!editing && (
                <button onClick={() => { setEditForm({ name: customer.name, phone: customer.phone || '', whatsapp_number: customer.whatsapp_number || '', gstin: customer.gstin || '', email: customer.email || '', address: customer.address || '' }); setEditing(true); }} className="text-xs text-primary font-medium shrink-0 hover:underline">
                  Edit
                </button>
              )}
            </div>
            {editing ? (
              <div className="mt-3 space-y-2">
                {[
                  { key: 'phone', label: 'Phone', icon: Phone, type: 'tel', placeholder: '+91 98765 43210' },
                  { key: 'whatsapp_number', label: 'WhatsApp', icon: MessageCircle, type: 'tel', placeholder: '+91 98765 43210' },
                  { key: 'email', label: 'Email', icon: Mail, type: 'email', placeholder: 'customer@example.com' },
                  { key: 'gstin', label: 'GSTIN', icon: Hash, type: 'text', placeholder: '29AAACP1234C1Z5' },
                  { key: 'address', label: 'Address', icon: MapPin, type: 'text', placeholder: 'Full address' },
                ].map(field => (
                  <div key={field.key} className="flex items-center gap-2">
                    <field.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                      value={(editForm as any)[field.key]}
                      onChange={e => setEditForm(f => ({ ...f, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      type={field.type}
                      className="flex-1 bg-transparent text-sm border-b border-dotted border-border focus:outline-none focus:border-primary placeholder:text-muted-foreground/50"
                    />
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
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
                    <Phone className="h-3.5 w-3.5" /> {customer.phone}
                  </div>
                )}
                {customer.whatsapp_number && customer.whatsapp_number !== customer.phone && (
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-3.5 w-3.5" /> {customer.whatsapp_number}
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5" /> {customer.email}
                  </div>
                )}
                {customer.gstin && (
                  <div className="flex items-center gap-2">
                    <Hash className="h-3.5 w-3.5" /> {customer.gstin}
                  </div>
                )}
                {customer.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" /> {customer.address}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Total Invoiced
          </div>
          <div className="mt-1 text-lg font-bold">{formatINR(totalInvoiced)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingDown className="h-3 w-3" /> Total Paid
          </div>
          <div className="mt-1 text-lg font-bold text-green-600">{formatINR(totalPaid)}</div>
        </div>
        <div className={`rounded-2xl border p-4 ${pending > 0 ? "border-yellow-200 bg-yellow-50" : "border-green-200 bg-green-50"}`}>
          <div className="text-xs text-muted-foreground">Pending</div>
          <div className={`mt-1 text-lg font-bold ${pending > 0 ? "text-yellow-700" : "text-green-700"}`}>{formatINR(pending)}</div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => {
            setSelectedInvoiceId(null);
            setEditingMessage(`Hello ${customer.name}, your pending amount of ₹${formatINR(pending)} is due. Please clear it at your earliest convenience.`);
            setShowWAModal(true);
          }}
          disabled={unpaidInvoices.length === 0 || customer.automationMode === 'muted'}
          className={`flex-1 flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-colors disabled:opacity-50 ${
            customer.automationMode === 'muted'
              ? 'bg-red-100 text-red-700 border-2 border-red-200'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {customer.automationMode === 'muted' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <MessageCircle className="h-4 w-4" />
          )}
          {customer.automationMode === 'muted' ? 'Reminders Paused' : customer.automationMode === 'manual' ? 'Review & Send' : 'Send Reminder'}
        </button>
        <button
          onClick={() => router.push(`/pos?customerId=${id}`)}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl border-2 border-indigo-200 bg-indigo-50 py-3 text-sm font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Invoice
        </button>
      </div>

      {waSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200">
          <span className="text-xs text-green-700 font-medium">Reminder sent via WhatsApp!</span>
        </div>
      )}

      {customer.automationMode === 'manual' && unpaidInvoices.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-yellow-50 border border-yellow-200">
          <Settings2 className="h-4 w-4 text-yellow-600 shrink-0" />
          <span className="text-xs text-yellow-700 font-medium">Manual mode — pending reminders need your approval before sending.</span>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
          <span>Transaction History</span>
          <span className="text-muted-foreground font-normal">{transactions.length} entries</span>
        </div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No transactions yet</div>
        ) : (
          <ul className="divide-y divide-border">
            {transactions.map((t, i) => (
              <li key={i} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <div className={`grid h-9 w-9 place-items-center rounded-full ${t.type === "invoice" ? "bg-blue-100 text-blue-600" : "bg-green-100 text-green-600"}`}>
                    {t.type === "invoice" ? <Receipt className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{t.label}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {new Date(t.date).toLocaleDateString()}
                      {t.type === "invoice" && (
                        <span className={`ml-2 capitalize ${t.status === "paid" ? "text-green-600" : t.status === "overdue" ? "text-red-600" : "text-yellow-600"}`}>· {t.status}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right flex items-center gap-2">
                  <span className={`text-sm font-bold ${t.type === "payment" ? "text-green-600" : ""}`}>{t.type === "payment" ? "+" : ""}{formatINR(t.amount)}</span>
                  {t.type === "invoice" && t.id && (
                    <Link href={`/invoices/${t.id}`} className="p-1 rounded hover:bg-secondary">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showWAModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border bg-white shadow-xl">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-lg">{customer.phone ? (customer.automationMode === 'manual' ? 'Review & Send Reminder' : 'Send WhatsApp Reminder') : 'Add phone number'}</h2>
              <button onClick={() => { setShowWAModal(false); setWaError(""); setEditingMessage(""); setMissingPhone(""); }} className="p-2 rounded-lg hover:bg-slate-100">✕</button>
            </div>
            {customer.phone ? (
              <>
                <div className="p-5 space-y-4">
                  {unpaidInvoices.length > 1 && (
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">Select Invoice</label>
                      <select
                        value={selectedInvoiceId || ""}
                        onChange={(e) => {
                          setSelectedInvoiceId(e.target.value || null)
                          const inv = invoices.find(i => i.id === e.target.value)
                          setEditingMessage(`Hello ${customer.name}, your pending amount of ₹${formatINR(inv?.total || pending)} is due. Please clear it at your earliest convenience.`)
                        }}
                        className="w-full rounded-xl border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">All unpaid invoices ({formatINR(pending)})</option>
                        {unpaidInvoices.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            #{inv.id?.slice(-8)} - {formatINR(inv.total)} ({inv.status})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                      {customer.automationMode === 'manual' ? 'Edit Message (optional)' : 'Message Preview'}
                    </label>
                    <textarea
                      value={editingMessage}
                      onChange={(e) => setEditingMessage(e.target.value)}
                      rows={4}
                      className="w-full rounded-xl border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                      readOnly={customer.automationMode !== 'manual'}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Personal Note (optional)</label>
                    <textarea
                      value={personalNote}
                      onChange={(e) => setPersonalNote(e.target.value)}
                      rows={2}
                      placeholder="Add a personal note..."
                      className="w-full rounded-xl border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                  </div>
                  {waError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">{waError}</div>
                  )}
                </div>
                <div className="flex gap-3 p-5 border-t bg-slate-50">
                  <Button variant="outline" className="flex-1" onClick={() => { setShowWAModal(false); setWaError(""); setEditingMessage(""); }}>Cancel</Button>
                  <button
                    onClick={() => sendReminder(selectedInvoiceId || undefined)}
                    disabled={sendingWA}
                    className="flex-1 h-11 rounded-xl bg-green-600 font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {sendingWA && <Loader2 className="h-4 w-4 animate-spin" />}
                    {sendingWA ? "Sending..." : customer.automationMode === 'manual' ? "Approve & Send" : "Send Reminder"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Customer Phone</label>
                    <input
                      value={missingPhone}
                      onChange={e => setMissingPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      type="tel"
                      className="w-full rounded-xl border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A phone number is required to send WhatsApp reminders. This will be saved to the customer profile.
                  </p>
                  {waError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">{waError}</div>
                  )}
                </div>
                <div className="flex gap-3 p-5 border-t bg-slate-50">
                  <Button variant="outline" className="flex-1" onClick={() => { setShowWAModal(false); setWaError(""); setEditingMessage(""); setMissingPhone(""); }}>Cancel</Button>
                  <button
                    onClick={async () => {
                      const phone = missingPhone.trim()
                      if (!phone) return
                      await db().customers.update(customer.id, { phone, updatedAt: new Date().toISOString() })
                      setCustomer({ ...customer, phone })
                      scheduleBackgroundSync()
                      sendReminder(selectedInvoiceId || undefined, phone)
                    }}
                    disabled={sendingWA || !missingPhone.trim()}
                    className="flex-1 h-11 rounded-xl bg-green-600 font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {sendingWA && <Loader2 className="h-4 w-4 animate-spin" />}
                    {sendingWA ? 'Saving & Sending...' : 'Save Phone & Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showAutomationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border bg-white shadow-xl">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-lg">Reminder Settings</h2>
              <button onClick={() => setShowAutomationModal(false)} className="p-2 rounded-lg hover:bg-slate-100">✕</button>
            </div>
            <div className="p-5 space-y-3">
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
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    (customer.automationMode || 'full_auto') === m
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-border bg-card hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full ${MODE_DOT_COLORS[m]}`} />
                      <span className="font-bold text-sm">{MODE_LABELS[m]}</span>
                    </div>
                    {(customer.automationMode || 'full_auto') === m && (
                      <CheckCircle2 className="h-5 w-5 text-blue-600" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground ml-6">{MODE_DESCRIPTIONS[m]}</p>
                </button>
              ))}
            </div>
            <div className="p-5 border-t bg-slate-50 rounded-b-2xl">
              <p className="text-xs text-muted-foreground">Changes take effect immediately. BillZo will respect this preference for all future reminders.</p>
            </div>
          </div>
        </div>
      )}

      <PaywallModal type="reminder" open={showPaywall} onClose={() => setShowPaywall(false)} currentCount={usageLimits?.currentReminderCount || 0} limit={usageLimits?.reminderLimit || 10} />
    </div>
  );
}
