"use client";

import { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Phone, Calendar, Receipt, Loader2, MessageCircle, Loader, AlertCircle, CheckCircle2, ExternalLink, Banknote, Copy, Check, Link2, QrCode, Download } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/billzo/Button";
import { db } from "@/lib/billzo/db";
import RecoveryJourney from "@/components/recovery/RecoveryJourney";
import { RecoveryBadge } from "@/components/billzo/RecoveryBadge";
import { formatINR } from "@/lib/utils";
import { getCookie } from "@/lib/cookies";
import { scheduleBackgroundSync } from "@/lib/billzo/sync";

const statusStyle: Record<string, string> = {
  synced: "bg-success-soft text-success",
  pending: "bg-warning-soft text-warning",
  failed: "bg-danger-soft text-danger",
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
  const [linkCopied, setLinkCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [recoveryAttribution, setRecoveryAttribution] = useState<any>(null);
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
    loadAttribution();
  }, [id]);

  const loadInvoice = async () => {
    try {
      setInvoiceError(null);
      const tenantId = getCookie('bz_tenant');
      if (!tenantId) {
        router.push("/auth");
        return;
      }

      let invoiceData = await db().invoices.get(id);
      let itemData: any[] = [];

      if (!invoiceData) {
        try {
          const res = await fetch(`/api/invoices/${id}`, { credentials: 'include' });
          if (res.ok) {
            const remoteData = await res.json();
            invoiceData = {
              id: remoteData.id,
              invoiceNumber: remoteData.invoice_number || remoteData.id.slice(0, 8),
              customerName: remoteData.customer_name || 'Walk-In Customer',
              customerPhone: remoteData.customer_phone || remoteData.phone || '',
              total: Number(remoteData.total || remoteData.grand_total || 0),
              outstandingAmount: Number(remoteData.outstanding_amount ?? remoteData.total ?? 0),
              status: remoteData.status || 'unpaid',
              syncStatus: remoteData.sync_status || 'synced',
              createdAt: remoteData.created_at || remoteData.createdAt || new Date().toISOString(),
              dueAt: remoteData.due_date || remoteData.dueAt || new Date().toISOString(),
            } as any;
            if (remoteData.items && remoteData.items.length > 0) {
              itemData = remoteData.items.map((it: any) => ({
                name: it.name || it.item_name || 'Item',
                qty: Number(it.qty || it.quantity || 1),
                price: Number(it.price || it.rate || 0),
                hsn: it.hsn || '',
                gstRate: it.gst_rate || 0
              }));
            }
          }
        } catch {
          // ignore fallback error
        }
      } else {
        itemData = await db().invoiceItems.where("invoiceId").equals(id).toArray();
        if (!itemData || itemData.length === 0) {
          try {
            const res = await fetch(`/api/invoices/${id}`, { credentials: 'include' });
            if (res.ok) {
              const remoteData = await res.json();
              if (remoteData.items && remoteData.items.length > 0) {
                itemData = remoteData.items.map((it: any) => ({
                  name: it.name || it.item_name || 'Item',
                  qty: Number(it.qty || it.quantity || 1),
                  price: Number(it.price || it.rate || 0),
                  hsn: it.hsn || '',
                  gstRate: it.gst_rate || 0
                }));
              }
            }
          } catch {
            // ignore fallback error
          }
        }
      }

      if (invoiceData) {
        setInvoice(invoiceData);
        setItems(itemData || []);
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

  const loadAttribution = async () => {
    try {
      const res = await fetch(`/api/recovery/timeline?invoiceId=${id}`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      setRecoveryAttribution(data.attribution);
    } catch {
      // attribution is non-critical
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
      loadAttribution()
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
      setShowQr(false)
      setQrDataUrl('')
      await loadInvoice()

      // Prerender QR so the Show QR action is instant
      if (!data.short_url) return
      try {
        const url = await QRCode.toDataURL(data.short_url, { width: 512, margin: 2 })
        setQrDataUrl(url)
      } catch {
        // QR is optional; the copy link / send actions still work
      }
    } catch (err: any) {
      setWaError(err.message)
    } finally {
      setGenLinkLoading(false)
    }
  }

  const copyPaymentLink = async () => {
    const link = paymentLink || ''
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = link
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
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
        loadAttribution()
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
      loadAttribution();
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
      <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-[0.1em]">
              <Receipt className="h-3.5 w-3.5 inline mr-1" /> {invoice.invoiceNumber || invoice.number || invoice.invoice_number || ('INV-' + (invoice.id ? invoice.id.slice(0, 8).toUpperCase() : '000000'))}
            </div>
            <div className="mt-2 text-[40px] font-bold text-[#16802d] leading-none tracking-tight tabular-nums">{formatINR(total)}</div>
            <div className="mt-3 inline-flex items-center gap-2 flex-wrap">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${statusStyle[invoice.syncStatus] || statusStyle.pending}`}>
                {invoice.syncStatus || "pending"}
              </span>
              {partial ? (
                <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-warning-soft text-warning">
                  PARTIAL
                </span>
              ) : (
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${paid ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
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

      {/* Invoice Actions */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3">
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">Invoice Actions</p>
        {paid ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="flex items-center justify-center gap-2 rounded-xl bg-success-soft text-success px-3 py-3 text-xs font-bold border border-success/30">
              <CheckCircle2 className="h-4 w-4" />
              Paid in Full
            </div>
            <button
              onClick={() => setShowWAModal(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white px-3 py-3 text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm active:scale-[0.98]"
            >
              {sendingWA ? <Loader className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              Send Receipt
            </button>
            <a
              href={`/api/invoices/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card text-foreground px-3 py-3 text-xs font-bold hover:bg-muted transition-colors shadow-sm active:scale-[0.98]"
            >
              <Download className="h-4 w-4 text-primary" />
              Download PDF
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <button
              onClick={() => setShowWAModal(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white px-3 py-3 text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm active:scale-[0.98]"
            >
              {sendingWA ? <Loader className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              Send WhatsApp
            </button>
            <button
              onClick={generatePaymentLink}
              disabled={genLinkLoading}
              className="flex items-center justify-center gap-2 rounded-xl bg-foreground text-background px-3 py-3 text-xs font-bold hover:bg-foreground/90 transition-colors disabled:opacity-50 shadow-sm active:scale-[0.98]"
            >
              {genLinkLoading ? <Loader className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {paymentLink ? 'Payment Link Ready' : 'Get Payment Link'}
            </button>
            <button
              onClick={() => setShowRecordPaymentModal(true)}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card text-foreground px-3 py-3 text-xs font-bold hover:bg-muted transition-colors active:scale-[0.98]"
            >
              <Banknote className="h-4 w-4 text-emerald-600" />
              Record Payment
            </button>
            <a
              href={`/api/invoices/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card text-foreground px-3 py-3 text-xs font-bold hover:bg-muted transition-colors shadow-sm active:scale-[0.98]"
            >
              <Download className="h-4 w-4 text-primary" />
              Download PDF
            </a>
          </div>
        )}
      </div>

        {paymentLink && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.1em] mb-1">Payment Link</div>
                <div className="truncate text-xs text-primary font-medium">{paymentLink}</div>
              </div>
              <button
                onClick={copyPaymentLink}
                className="shrink-0 flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/70 transition-colors"
              >
                {linkCopied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {linkCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowQr(false); setShowWAModal(true) }}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-success py-3 text-xs font-bold text-white hover:bg-success transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Send via WhatsApp
              </button>
              <button
                onClick={() => setShowQr(v => !v)}
                disabled={!qrDataUrl}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border-2 border-border bg-card py-3 text-xs font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <QrCode className="h-3.5 w-3.5" />
                {showQr ? 'Hide QR' : 'Show QR'}
              </button>
            </div>
            {showQr && qrDataUrl && (
              <div className="flex flex-col items-center gap-2 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="UPI payment QR" className="h-44 w-44 rounded-xl border border-border" />
                <div className="text-[11px] text-muted-foreground text-center">
                  Scan to pay — opens the payment page on the customer's phone
                </div>
              </div>
            )}
          </div>
        )}

        {(waSuccess) && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-success-soft border border-success">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            <span className="text-xs text-success font-medium">Message sent!</span>
          </div>
        )}

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
                        : `Hello ${invoice.customerName}, ₹${total} due on invoice #${invoice.invoiceNumber || invoice.id?.slice(-8)}. Pay here: ${paymentLink || '[payment link]'}${personalNote ? `\n\n${personalNote}` : ''}`}
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
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-danger-soft border border-danger text-danger text-xs">
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
                    className="flex-1 h-11 rounded-xl bg-success font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
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
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-danger-soft border border-danger text-danger text-xs">
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
                    className="flex-1 h-11 rounded-xl bg-success font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
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

      {/* Items Purchased Section */}
      {items.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-border text-xs font-bold text-foreground uppercase tracking-wider bg-muted/40 flex items-center justify-between">
            <span>Items Purchased ({items.length})</span>
            <span className="text-[11px] text-muted-foreground font-normal normal-case">Itemized Breakdown</span>
          </div>
          <div className="px-6 py-3 grid grid-cols-12 gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/20">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-5">Item Name</div>
            <div className="col-span-2 text-center">Qty</div>
            <div className="col-span-2 text-right">Rate</div>
            <div className="col-span-2 text-right">Amount</div>
          </div>
          {items.map((it, i) => (
            <div key={i} className="px-6 py-3.5 grid grid-cols-12 gap-2 text-sm items-center border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
              <div className="col-span-1 text-center text-muted-foreground text-xs">{i + 1}</div>
              <div className="col-span-5">
                <div className="font-semibold text-foreground">{it.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {it.hsn && <>HSN {it.hsn}</>}
                  {it.hsn && it.gstRate ? ' · ' : ''}
                  {it.gstRate ? `GST ${it.gstRate}%` : ''}
                </div>
              </div>
              <div className="col-span-2 text-center text-muted-foreground font-medium">{it.qty}</div>
              <div className="col-span-2 text-right text-muted-foreground tabular-nums font-medium">{formatINR(it.price)}</div>
              <div className="col-span-2 text-right font-bold text-foreground tabular-nums">{formatINR(it.qty * it.price)}</div>
            </div>
          ))}
          <div className="border-t border-border px-6 py-4 bg-muted/30 space-y-1.5">
            <div className="grid grid-cols-12 gap-2 text-sm">
              <div className="col-span-10 text-right text-muted-foreground font-medium">Subtotal</div>
              <div className="col-span-2 text-right text-foreground font-semibold tabular-nums">{formatINR(subtotal)}</div>
            </div>
            {tax > 0 && (
              <div className="grid grid-cols-12 gap-2 text-sm">
                <div className="col-span-10 text-right text-muted-foreground font-medium">GST / Tax</div>
                <div className="col-span-2 text-right text-foreground font-semibold tabular-nums">{formatINR(tax)}</div>
              </div>
            )}
            <div className="grid grid-cols-12 gap-2 text-base font-bold pt-2 border-t border-border mt-2">
              <div className="col-span-10 text-right text-foreground">Grand Total</div>
              <div className="col-span-2 text-right text-emerald-600 tabular-nums">{formatINR(total)}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-1 shadow-sm">
          <div className="text-xs font-bold text-foreground uppercase tracking-wider">Items Purchased</div>
          <p className="text-xs text-muted-foreground">General Sale / Standard invoice total of {formatINR(total)} (no itemized breakdown logged).</p>
        </div>
      )}

      {/* Recovery Journey */}
      <RecoveryJourney invoiceId={id} />

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
                <div className="flex items-center gap-2 p-3 rounded-xl bg-success-soft border border-success">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  <span className="text-xs text-success font-medium">Override applied! Worker will send the reminder on next cycle.</span>
                </div>
              ) : (
                <>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Blocked Reason</div>
                    <div className="rounded-xl bg-warning-soft border border-warning p-3 text-sm text-warning">
                      {overrideBlockedReason}
                    </div>
                  </div>

                  {overrideWarning && (
                    <div className="rounded-xl bg-danger-soft border border-danger p-3 text-sm text-danger">
                      <div className="font-semibold mb-1">Risk Warning</div>
                      <p>{overrideWarning}</p>
                      <p className="mt-2 text-xs text-danger">
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
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-danger-soft border border-danger text-danger text-xs">
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
                          ? 'bg-danger hover:bg-danger'
                          : 'bg-warning hover:bg-warning'
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
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-soft">
                    <CheckCircle2 size={32} className="text-success" />
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
                  <div className="rounded-xl bg-muted border border-border px-4 py-3 mb-4">
                    <p className="text-xs text-muted-foreground font-medium">Outstanding</p>
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
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-danger-soft border border-danger text-danger text-xs">
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
                      className="flex-1 h-11 rounded-xl bg-success font-bold text-white flex items-center justify-center gap-2 hover:bg-success transition-colors disabled:opacity-50"
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

      <div className="text-center text-[10px] text-[#cbd5e1] pt-4">
        Powered by BillZo
      </div>
    </div>
  );
}

