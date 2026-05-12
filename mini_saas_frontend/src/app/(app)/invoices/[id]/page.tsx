"use client";

import { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Phone, Calendar, Receipt, Loader2 } from "lucide-react";
import { db } from "@/lib/billzo/db";

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

  const id = params.id as string;

  useEffect(() => {
    loadInvoice();
  }, [id]);

  const loadInvoice = async () => {
    try {
      function getCookie(name: string) {
        if (typeof document === 'undefined') return null
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
        return match ? match[2] : null
      }
      const tenantId = getCookie('bz_tenant');
      if (!tenantId) {
        router.push("/login");
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