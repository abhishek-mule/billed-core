"use client";

import { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Phone, Calendar, Receipt, Loader2, MessageCircle, Loader, AlertCircle, CheckCircle2, ExternalLink, Banknote } from "lucide-react";
import { Button } from "@/components/billzo/Button";
import { RazorpayCheckoutButton } from "@/components/billzo/RazorpayCheckoutButton";
import { db } from "@/lib/billzo/db";
import { RecoveryTimeline } from "@/components/billzo/RecoveryTimeline";
import { RecoveryBadge } from "@/components/billzo/RecoveryBadge";
import { formatINR } from "@/lib/utils";
import { getCookie } from "@/lib/cookies";
import { scheduleBackgroundSync } from "@/lib/billzo/sync";

const statusStyle: Record<string, string> = {
  synced: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingWA, setSendingWA] = useState(false);
  const [waError, setWaError] = useState('');
  const [waSuccess, setWaSuccess] = useState(false);
  const [showWAModal, setShowWAModal] = useState(false);
  const [personalNote, setPersonalNote] = useState('');
  const [missingPhone, setMissingPhone] = useState('');
  const [genLinkLoading, setGenLinkLoading] = useState(false);
  const [paymentLink, setPaymentLink] = useState('');
  const [recoveryTimeline, setRecoveryTimeline] = useState<any[]>([]);
  const [recoveryAttribution, setRecoveryAttribution] = useState<any>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideBlockedReason, setOverrideBlockedReason] = useState('');
  const [overriding, setOverriding] = useState(false);
  const [overrideError, setOverrideError] = useState('');
  const [overrideWarning, setOverrideWarning] = useState('');
  const [overrideRequiresAck, setOverrideRequiresAck] = useState(false);
  const [overrideSuccess, setOverrideSuccess] = useState(false);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [recordAmount, setRecordAmount] = useState('');
  const [recordSource, setRecordSource] = useState('cash');
  const [recordNotes, setRecordNotes] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [recordPaymentError, setRecordPaymentError] = useState('');
  const [recordPaymentSuccess, setRecordPaymentSuccess] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const id = params.id as string;

  useEffect(() => {
    loadInvoice();
    loadRecoveryData();
  }, [id]);

  const loadInvoice = async () => {
    try {
      setInvoiceError(null);
      const tenantId = getCookie('bz_tenant');
      if (!tenantId) {
        router.push("/auth");
        return;
      }

      const invoiceData = await db().invoices.get(id);
      if (invoiceData) {
        setInvoice(invoiceData);
        const itemData = await db().invoiceItems.where("invoiceId").equals(id).toArray();
        setItems(itemData);
      } else {
        setInvoiceError('Invoice not found');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to load invoice';
      console.error("Failed to load invoice:", error);
      setInvoiceError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const loadRecoveryData = async () => {
    try {
      setTimelineLoading(true);
      setTimelineError(null);
      const res = await fetch(`/api/recovery/timeline?invoiceId=${id}`, {
        credentials: 'include',
      });
      
      if (!res.ok) {
        let errorMsg = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch { console.error('[InvoiceDetail] Failed to parse error response', errorMsg) }
        throw new Error(errorMsg);
      }
      
      const data = await res.json();
      setRecoveryTimeline(data.events || []);
      setRecoveryAttribution(data.attribution);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to load recovery data';
      console.error("Failed to load recovery data:", error);
      setTimelineError(errorMsg);
    } finally {
      setTimelineLoading(false);
    }
  };

  const sendWhatsApp = async (phoneOverride?: string) => {
    const phone = phoneOverride || invoice?.customerPhone;
    if (!phone) return
    setSendingWA(true)
    setWaError('')
    try {
      const res = await fetch('/api/intents/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          customerPhone: phone,
          templateKey: paid ? 'receipt' : 'invoice',
          vars: {
            '1': invoice.customerName,
            '2': formatINR(total),
            '3': invoice.invoiceNumber || invoice.id?.slice(-8) || '',
            '4': invoice.paymentLinkUrl || '',
          },
          personalNote: personalNote.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setWaSuccess(true)
      setShowWAModal(false)
      setMissingPhone('')
      setPersonalNote('')
      loadRecoveryData()
      setTimeout(() => setWaSuccess(false), 3000)
    } catch (err: any) {
      setWaError(err.message)
    } finally {
      setSendingWA(false)
    }
  }

  const savePhoneAndSend = async () => {
    const phone = missingPhone.trim();
    if (!phone) return;
    setSendingWA(true);
    setWaError('');
    try {
      const now = new Date().toISOString();
      await db().invoices.update(invoice.id, { customerPhone: phone, updatedAt: now });
      if (invoice.customerId) {
        await db().customers.update(invoice.customerId, { phone, updatedAt: now });
      }
      setInvoice((prev: any) => prev ? { ...prev, customerPhone: phone } : prev);
      scheduleBackgroundSync();
    } catch (err: any) {
      setWaError(err.message);
      setSendingWA(false);
      return;
    }
    await sendWhatsApp(phone);
  };

  const generatePaymentLink = async () => {
    if (!invoice || invoice.status === 'paid') return
    setGenLinkLoading(true)
    try {
      const res = await fetch('/api/payment/payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          invoiceId: invoice.id,
          amount: total,
          customerName: invoice.customerName,
          customerPhone: invoice.customerPhone,
          purpose: `Invoice #${invoice.invoiceNumber || invoice.id?.slice(-8)} payment`,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate link')
      setPaymentLink(data.short_url)
      await loadInvoice()
    } catch (err: any) {
      setWaError(err.message)
    } finally {
      setGenLinkLoading(false)
    }
  }

  const handleOverride = (blockedReason: string) => {
    setOverrideBlockedReason(blockedReason)
    setOverrideReason('')
    setOverrideError('')
    setOverrideWarning('')
    setOverrideRequiresAck(false)
    setOverrideSuccess(false)
    setShowOverrideModal(true)
  }

  const handleOverrideConfirm = async () => {
    setOverriding(true)
    setOverrideError('')
    try {
      const res = await fetch('/api/recovery/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          invoiceId: id,
          reason: overrideReason.trim() || `Merchant override: ${overrideBlockedReason}`,
          warningAcked: overrideRequiresAck || false,
        }),
      })
      const data = await res.json()

      if (data.requiresAck) {
        setOverrideWarning(data.warning || '')
        setOverrideRequiresAck(true)
        return
      }

      if (data.applied || data.success) {
        setOverrideSuccess(true)
        loadRecoveryData()
        setTimeout(() => {
          setShowOverrideModal(false)
          setOverrideSuccess(false)
        }, 2000)
      } else {
        setOverrideError(data.error || 'Override failed')
      }
    } catch (err: any) {
      setOverrideError(err.message)
    } finally {
      setOverriding(false)
    }
  }

  const handleRecordPayment = async () => {
    const amount = parseFloat(recordAmount);
    if (!amount || amount <= 0) {
      setRecordPaymentError('Enter a valid amount');
      return;
    }
    setRecordingPayment(true);
    setRecordPaymentError('');
    try {
      const res = await fetch('/api/recovery/record-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          invoiceId: id,
          amount,
          source: recordSource,
          notes: recordNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record payment');
      setRecordPaymentSuccess(true);
      loadInvoice();
      loadRecoveryData();
    } catch (err: any) {
      setRecordPaymentError(err.message);
    } finally {
      setRecordingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="px-4 py-12 text-center text-sm text-muted-foreground">
        Invoice not found.{" "}
        <Link href="/invoices" className="text-primary font-medium">Back to invoices</Link>
      </div>
    );
  }

  const invoiceTotal = items.reduce((s, i) => s + i.price * i.qty, 0) || invoice.total;
  const itemsWithTax = items.map(i => {
    const lineTotal = i.price * i.qty;
    const taxable = i.gstRate ? Math.round(lineTotal * 100 / (100 + i.gstRate)) : lineTotal;
    return { ...i, taxable, gstAmount: lineTotal - taxable };
  });
  const subtotal = itemsWithTax.reduce((s, i) => s + i.taxable, 0);
  const tax = itemsWithTax.reduce((s, i) => s + i.gstAmount, 0);
  const total = invoiceTotal;
  const paid = invoice.status === "paid";
  const partial = invoice.status === "partial";

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto space-y-5">
      <Link href="/invoices" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All invoices
      </Link>

      <div className="rounded-2xl border border-border bg-card p-5 lg:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5" /> {invoice.invoiceNumber || invoice.id?.slice(0, 8)}
            </div>
            <div className="mt-1 text-3xl lg:text-4xl font-bold">{formatINR(total)}</div>
            <div className="mt-2 inline-flex items-center gap-2 flex-wrap">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${statusStyle[invoice.syncStatus] || statusStyle.pending}`}>
                {invoice.syncStatus || "pending"}
              </span>
              {partial ? (
                <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-orange-100 text-orange-700">
                  PARTIAL
                </span>
              ) : (
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${paid ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                  {paid ? "PAID" : "UNPAID"}
                </span>
              )}
              {(paid || partial) && recoveryAttribution?.attributed && (
                <RecoveryBadge
                  recoveredAmount={total}
                  attributionType={recoveryAttribution.attributionType}
                  confidenceScore={recoveryAttribution.confidenceScore}
                />
              )}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground hidden sm:block">
            <div className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {new Date(invoice.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Customer</div>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-sm font-semibold">
            {invoice.customerName?.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">{invoice.customerName}</div>
            {invoice.customerPhone && (
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Phone className="h-3 w-3" /> {invoice.customerPhone}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setShowWAModal(true)}
            className="flex items-center justify-center gap-2 rounded-2xl bg-green-600 py-4 text-sm font-bold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {sendingWA ? <Loader className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            WhatsApp
          </button>

          {!paid && (
            <RazorpayCheckoutButton
              invoiceId={invoice.id}
              amount={total}
              customerName={invoice.customerName}
              customerPhone={invoice.customerPhone}
              onPaymentSuccess={() => { loadInvoice(); loadRecoveryData(); }}
              className="rounded-2xl py-4"
            />
          )}

          {paid ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-green-100 py-4 text-sm font-bold text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              Paid
            </div>
          ) : (
            <button
              onClick={() => {
                const link = paymentLink || invoice?.paymentLinkUrl
                if (link) {
                  navigator.clipboard.writeText(link)
                } else {
                  generatePaymentLink()
                }
              }}
              disabled={genLinkLoading}
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card py-4 text-sm font-bold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {genLinkLoading ? <Loader className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              {paymentLink || invoice?.paymentLinkUrl ? 'Copy Link' : 'Payment Link'}
            </button>
          )}

          {!paid && (
            <button
              onClick={() => setShowRecordPaymentModal(true)}
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card py-4 text-sm font-bold text-muted-foreground hover:bg-muted transition-colors"
            >
              <Banknote className="h-4 w-4" />
              Record Payment
            </button>
          )}
        </div>

        {(paymentLink || invoice?.paymentLinkUrl) && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <a
              href={paymentLink || invoice?.paymentLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-green-700 font-medium underline break-all"
            >
              {paymentLink || invoice?.paymentLinkUrl}
            </a>
          </div>
        )}

        {(waSuccess) && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <span className="text-xs text-green-700 font-medium">Message sent!</span>
          </div>
        )}
      </div>

      {showWAModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border bg-card shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-lg">{invoice.customerPhone ? 'Send via WhatsApp' : 'Add phone number'}</h2>
              <button onClick={() => { setShowWAModal(false); setWaError(''); setMissingPhone(''); }} className="p-2 rounded-lg hover:bg-muted">
                ✕
              </button>
            </div>
            {invoice.customerPhone ? (
              <>
                <div className="p-5 space-y-4">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Preview</div>
                    <div className="rounded-xl bg-muted/50 p-3 text-sm text-foreground leading-relaxed">
                      {paid
                        ? `Payment received! ₹${total} received from ${invoice.customerName} for invoice #${invoice.invoiceNumber || invoice.id?.slice(-8)}. Thank you!${personalNote ? `\n\n${personalNote}` : ''}`
                        : `Hello ${invoice.customerName}, your invoice for ₹${total} is ready. Pay now: ${invoice.paymentLinkUrl || '[payment link]'}${personalNote ? `\n\n${personalNote}` : ''}`}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Personal Note (optional)</label>
                    <textarea
                      value={personalNote}
                      onChange={e => setPersonalNote(e.target.value)}
                      rows={2}
                      placeholder="Add a personal note..."
                      className="w-full rounded-xl border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                  </div>
                  {waError && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {waError}
                    </div>
                  )}
                </div>
                <div className="flex gap-3 p-5 border-t bg-muted/50">
                  <Button variant="outline" className="flex-1" onClick={() => { setShowWAModal(false); setWaError('') }}>Cancel</Button>
                  <button
                    onClick={() => sendWhatsApp()}
                    disabled={sendingWA}
                    className="flex-1 h-11 rounded-xl bg-green-600 font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {sendingWA && <Loader className="h-4 w-4 animate-spin" />}
                    {sendingWA ? 'Sending...' : 'Send Message'}
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
                    A phone number is required to send WhatsApp reminders.
                  </p>
                  {waError && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {waError}
                    </div>
                  )}
                </div>
                <div className="flex gap-3 p-5 border-t bg-muted/50">
                  <Button variant="outline" className="flex-1" onClick={() => { setShowWAModal(false); setWaError(''); setMissingPhone(''); }}>Cancel</Button>
                  <button
                    onClick={savePhoneAndSend}
                    disabled={sendingWA || !missingPhone.trim()}
                    className="flex-1 h-11 rounded-xl bg-green-600 font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {sendingWA && <Loader className="h-4 w-4 animate-spin" />}
                    {sendingWA ? 'Saving & Sending...' : 'Save Phone & Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Items
          </div>
          <ul className="divide-y divide-border">
            {items.map((it, i) => (
              <li key={i} className="px-5 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{it.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {it.qty} × {formatINR(it.price)} · GST {it.gstRate}%
                    {it.hsn && <> · HSN {it.hsn}</>}
                  </div>
                </div>
                <div className="text-sm font-bold whitespace-nowrap">
                  {formatINR(it.qty * it.price)}
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-border p-5 space-y-1.5 bg-secondary/30 text-sm">
            <Row label="Subtotal" value={formatINR(subtotal)} />
            <Row label="GST" value={formatINR(tax)} />
            <Row label="Total" value={formatINR(total)} bold />
          </div>
        </div>
      )}

      {/* Recovery Timeline */}
      {timelineLoading ? (
        <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <RecoveryTimeline
          events={recoveryTimeline}
          recoveredAmount={paid && recoveryAttribution?.attributed ? total : 0}
          onOverride={handleOverride}
        />
      )}

      {/* Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border bg-card shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-lg">Override Decision Engine</h2>
              <button onClick={() => { setShowOverrideModal(false); setOverrideError(''); setOverrideWarning(''); }} className="p-2 rounded-lg hover:bg-muted">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              {overrideSuccess ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-xs text-green-700 font-medium">Override applied! Worker will send the reminder on next cycle.</span>
                </div>
              ) : (
                <>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Blocked Reason</div>
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                      {overrideBlockedReason}
                    </div>
                  </div>

                  {overrideWarning && (
                    <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                      <div className="font-semibold mb-1">Risk Warning</div>
                      <p>{overrideWarning}</p>
                      <p className="mt-2 text-xs text-red-600">
                        This may damage the customer relationship. Only proceed if you are certain.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Your Reason (optional)</label>
                    <textarea
                      value={overrideReason}
                      onChange={e => setOverrideReason(e.target.value)}
                      rows={2}
                      placeholder="Why are you overriding? This will be logged."
                      className="w-full rounded-xl border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                  </div>

                  {overrideError && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {overrideError}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => { setShowOverrideModal(false); setOverrideError(''); setOverrideWarning(''); }}
                      className="flex-1 h-11 rounded-xl border-2 border-border bg-card font-bold text-sm hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleOverrideConfirm}
                      disabled={overriding || (overrideRequiresAck && !overrideWarning)}
                      className={`flex-1 h-11 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-colors ${
                        overrideRequiresAck
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-amber-600 hover:bg-amber-700'
                      } disabled:opacity-50`}
                    >
                      {overriding && <Loader className="h-4 w-4 animate-spin" />}
                      {overriding
                        ? 'Applying...'
                        : overrideRequiresAck
                          ? 'Yes, I Accept the Risk'
                          : 'Override & Send'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showRecordPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border bg-card shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-lg">Record Payment</h2>
              <button onClick={() => { setShowRecordPaymentModal(false); setRecordPaymentError(''); }} className="p-2 rounded-lg hover:bg-muted">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              {recordPaymentSuccess ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                    <CheckCircle2 size={32} className="text-emerald-600" />
                  </div>
                  <p className="font-bold text-foreground text-lg">Payment Recorded</p>
                  <p className="text-sm text-muted-foreground text-center">
                    {formatINR(parseFloat(recordAmount) || 0)} via {recordSource.replace('_', ' ')}
                  </p>
                  <button
                    onClick={() => { setShowRecordPaymentModal(false); setRecordPaymentSuccess(false); setRecordAmount(''); setRecordNotes(''); setRecordSource('cash'); }}
                    className="mt-2 px-6 h-10 rounded-lg bg-foreground text-background text-sm font-bold"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 mb-4">
                    <p className="text-xs text-slate-500 font-medium">Outstanding</p>
                    <p className="text-xl font-bold text-foreground tabular-nums">
                      {formatINR(Math.max(0, (parseFloat(invoice?.total) || 0) - (parseFloat(invoice?.paidAmount) || 0)))}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Amount (₹)</label>
                    <input
                      type="number"
                      value={recordAmount}
                      onChange={e => setRecordAmount(e.target.value)}
                      placeholder="1000"
                      min="1"
                      className="w-full rounded-xl border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Payment Source</label>
                    <select
                      value={recordSource}
                      onChange={e => setRecordSource(e.target.value)}
                      className="w-full rounded-xl border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="cheque">Cheque</option>
                      <option value="upi">UPI</option>
                      <option value="adjustment">Adjustment</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Notes (optional)</label>
                    <textarea
                      value={recordNotes}
                      onChange={e => setRecordNotes(e.target.value)}
                      rows={2}
                      placeholder="e.g. Customer paid in person"
                      className="w-full rounded-xl border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                  </div>
                  {recordPaymentError && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {recordPaymentError}
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => { setShowRecordPaymentModal(false); setRecordPaymentError(''); }}
                      className="flex-1 h-11 rounded-xl border-2 border-border bg-card font-bold text-sm hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRecordPayment}
                      disabled={recordingPayment || !recordAmount || parseFloat(recordAmount) <= 0}
                      className="flex-1 h-11 rounded-xl bg-green-600 font-bold text-white flex items-center justify-center gap-2 hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      {recordingPayment && <Loader className="h-4 w-4 animate-spin" />}
                      {recordingPayment ? 'Recording...' : 'Record Payment'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="text-center text-[11px] text-muted-foreground pt-4">
        Invoice from BillZo
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-base font-bold pt-1.5 border-t border-border" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}