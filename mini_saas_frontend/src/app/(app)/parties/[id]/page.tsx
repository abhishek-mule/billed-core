"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Phone, Mail, MapPin, Hash, MessageCircle, Plus, CreditCard, Loader2, ExternalLink, Receipt, Calendar, TrendingUp, TrendingDown } from "lucide-react";
import { db } from "@/lib/billzo/db";
import { getUsageLimits, incrementReminderCount } from "@/lib/billzo/usage";
import { PaywallModal } from "@/components/billzo/PaywallModal";

const formatINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

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

  useEffect(() => {
    loadParty();
  }, [id]);

  const getCookie = (name: string) => {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? match[2] : null;
  };

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

  const sendReminder = async (invoiceId?: string) => {
    const tenantId = getCookie("bz_tenant");
    if (!tenantId || !customer) return;

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
          invoiceId: targetInvoice?.id,
          templateKey: targetInvoice ? (targetInvoice.status === "paid" ? "receipt" : "invoice") : "udharGentle",
          vars: {
            "1": customer.name,
            "2": formatINR(targetInvoice?.total || pending),
            "3": targetInvoice?.id?.slice(-8) || "",
            "4": targetInvoice?.paymentLinkUrl || "",
          },
          personalNote: personalNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      await incrementReminderCount(tenantId);
      setWaSuccess(true);
      setShowWAModal(false);
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
          <div className={`grid h-14 w-14 place-items-center rounded-full text-xl font-bold ${pending > 0 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
            {customer.name?.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{customer.name}</h1>
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
            setShowWAModal(true);
          }}
          disabled={unpaidInvoices.length === 0}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          <MessageCircle className="h-4 w-4" />
          Send Reminder
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
          <div className="w-full max-w-md rounded-2xl border bg-white shadow-xl">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-lg">Send WhatsApp Reminder</h2>
              <button onClick={() => { setShowWAModal(false); setWaError(""); }} className="p-2 rounded-lg hover:bg-slate-100">✕</button>
            </div>
            <div className="p-5 space-y-4">
              {unpaidInvoices.length > 1 && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Select Invoice</label>
                  <select
                    value={selectedInvoiceId || ""}
                    onChange={(e) => setSelectedInvoiceId(e.target.value || null)}
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
                <div className="text-xs font-semibold text-muted-foreground mb-1">Preview</div>
                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700 leading-relaxed">
                  {`Hello ${customer.name}, your pending amount of ₹${pending} is due. Please clear it at your earliest convenience.${personalNote ? `\n\n${personalNote}` : ""}`}
                </div>
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
              <button onClick={() => { setShowWAModal(false); setWaError(""); }} className="flex-1 h-11 rounded-xl border font-medium">Cancel</button>
              <button
                onClick={() => sendReminder(selectedInvoiceId || undefined)}
                disabled={sendingWA}
                className="flex-1 h-11 rounded-xl bg-green-600 font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sendingWA && <Loader2 className="h-4 w-4 animate-spin" />}
                {sendingWA ? "Sending..." : "Send Reminder"}
              </button>
            </div>
          </div>
        </div>
      )}

      <PaywallModal type="reminder" open={showPaywall} onClose={() => setShowPaywall(false)} currentCount={usageLimits?.currentReminderCount || 0} limit={usageLimits?.reminderLimit || 10} />
    </div>
  );
}
