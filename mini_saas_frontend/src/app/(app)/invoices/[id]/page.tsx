"use client";

import { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Phone, Calendar, Receipt, Loader2, MessageCircle, Loader, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import { RazorpayCheckoutButton } from "@/components/billzo/RazorpayCheckoutButton";
import { db } from "@/lib/billzo/db";
import { RecoveryTimeline } from "@/components/billzo/RecoveryTimeline";
import { RecoveryBadge } from "@/components/billzo/RecoveryBadge";

const statusStyle: Record<string, string> = {
  synced: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

const formatINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

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
  const [genLinkLoading, setGenLinkLoading] = useState(false);
  const [paymentLink, setPaymentLink] = useState('');
  const [recoveryTimeline, setRecoveryTimeline] = useState<any[]>([]);
  const [recoveryAttribution, setRecoveryAttribution] = useState<any>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const id = params.id as string;

  useEffect(() => {
    loadInvoice();
    loadRecoveryData();
  }, [id]);

  const getCookie = (name: string) => {
    if (typeof document === 'undefined') return null
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
    return match ? match[2] : null
  }

  const loadInvoice = async () => {
    try {
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
      }
    } catch (error) {
      console.error("Failed to load invoice:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecoveryData = async () => {
    try {
      setTimelineLoading(true);
      const res = await fetch(`/api/recovery/timeline?invoiceId=${id}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setRecoveryTimeline(data.events || []);
        setRecoveryAttribution(data.attribution);
      }
    } catch (error) {
      console.error("Failed to load recovery data:", error);
    } finally {
      setTimelineLoading(false);
    }
  };

  const sendWhatsApp = async () => {
    if (!invoice?.customerPhone) return
    setSendingWA(true)
    setWaError('')
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          templateKey: paid ? 'receipt' : 'invoice',
          vars: {
            '1': invoice.customerName,
            '2': formatINR(total),
            '3': invoice.id?.slice(-8) || '',
            '4': invoice.paymentLinkUrl || '',
          },
          personalNote: personalNote.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setWaSuccess(true)
      setShowWAModal(false)
      setPersonalNote('')
      loadRecoveryData()
      setTimeout(() => setWaSuccess(false), 3000)
    } catch (err: any) {
      setWaError(err.message)
    } finally {
      setSendingWA(false)
    }
  }

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
          purpose: `Invoice #${invoice.id?.slice(-8)} payment`,
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

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const tax = items.reduce((s, i) => s + (i.price * i.qty * i.gstRate) / 100, 0);
  const total = subtotal + tax || invoice.total;
  const paid = invoice.status !== "unpaid" && invoice.status !== "overdue";

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto space-y-5">
      <Link href="/invoices" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All invoices
      </Link>

      <div className="rounded-2xl border border-border bg-card p-5 lg:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5" /> {invoice.id?.slice(0, 8)}
            </div>
            <div className="mt-1 text-3xl lg:text-4xl font-bold">{formatINR(total)}</div>
            <div className="mt-2 inline-flex items-center gap-2 flex-wrap">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${statusStyle[invoice.syncStatus] || statusStyle.pending}`}>
                {invoice.syncStatus || "pending"}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${paid ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                {paid ? "PAID" : "UNPAID"}
              </span>
              <span className="text-xs text-muted-foreground capitalize">· {invoice.status}</span>
              {paid && recoveryAttribution?.attributed && (
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
              onClick={generatePaymentLink}
              disabled={genLinkLoading}
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card py-4 text-sm font-bold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {genLinkLoading ? <Loader className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              {paymentLink || invoice?.paymentLinkUrl ? 'Copy Link' : 'Payment Link'}
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
          <div className="w-full max-w-md rounded-2xl border bg-white shadow-xl">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-lg">Send via WhatsApp</h2>
              <button onClick={() => { setShowWAModal(false); setWaError('') }} className="p-2 rounded-lg hover:bg-slate-100">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">Preview</div>
                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700 leading-relaxed">
                  {paid
                    ? `Payment received! ₹${total} received from ${invoice.customerName} for invoice #${invoice.id?.slice(-8)}. Thank you!${personalNote ? `\n\n${personalNote}` : ''}`
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
            <div className="flex gap-3 p-5 border-t bg-slate-50">
              <button onClick={() => { setShowWAModal(false); setWaError('') }} className="flex-1 h-11 rounded-xl border font-medium">Cancel</button>
              <button
                onClick={sendWhatsApp}
                disabled={sendingWA}
                className="flex-1 h-11 rounded-xl bg-green-600 font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sendingWA && <Loader className="h-4 w-4 animate-spin" />}
                {sendingWA ? 'Sending...' : 'Send Message'}
              </button>
            </div>
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
        />
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