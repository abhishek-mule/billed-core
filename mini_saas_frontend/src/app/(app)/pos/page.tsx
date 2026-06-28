"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Plus, Minus, Trash2, X, CheckCircle2, MessageCircle, User, Printer, Loader2, Package, Phone } from "lucide-react";
import { Button } from "@/components/billzo/Button";
import { db } from "@/lib/billzo/db";
import { getTenantId } from "@/lib/billzo/tenant";

import { downloadInvoicePDF, getWhatsAppShareLink } from "@/lib/billzo/pdf";
// Barcode scanning removed in V2
import { EmptyState } from '@/components/billzo/EmptyState';
import { handlePOSInvoice, scheduleBackgroundSync } from "@/lib/billzo/actions";
import { retryProductSync } from "@/lib/billzo/products-service";
import { useSyncHealth } from "@/lib/billzo/sync-health";
import { useLiveQueryState } from "@/lib/billzo/use-live-query";
import { toast } from "sonner";
import { formatINR } from "@/lib/utils";
import { getCookie } from "@/lib/cookies";
import type { POSSuccessResult } from "@/lib/billzo/api-types";
import type { Product, Tenant } from "@/lib/billzo/types";

type CartItem = {
  id: string;
  name: string;
  hsn?: string;
  gstRate: number;
  salePrice: number;
  stock: number;
  qty: number;
  unit?: string;
  lowStockAt: number;
};

export default function POSPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<string>("Walk-in Customer");
  const [customerId, setCustomerId] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showPay, setShowPay] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [success, setSuccess] = useState<POSSuccessResult | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [lookingUpBarcode, setLookingUpBarcode] = useState(false);
  const [tenantData, setTenantData] = useState<Tenant | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const activeTenantId = getTenantId();
    if (!activeTenantId) {
      router.push("/auth");
      return;
    }

    setTenantId(activeTenantId);
    db().tenants.get(activeTenantId).then(t => setTenantData(t ?? null));
  }, []);

  const { data: products, loading: productsLoading, error: productsError } = useLiveQueryState<any[]>(
    async () => {
      if (!tenantId) return [];
      return db().products.where("tenantId").equals(tenantId).toArray();
    },
    [tenantId, retryCount],
    [],
  );
  const { data: customers, loading: customersLoading, error: customersError } = useLiveQueryState<any[]>(
    async () => {
      if (!tenantId) return [];
      return db().customers.where("tenantId").equals(tenantId).toArray();
    },
    [tenantId, retryCount],
    [],
  );
  const { data: syncHealth } = useSyncHealth(tenantId);

  // Auto-select customer from URL param
  useEffect(() => {
    const customerId = searchParams.get('customerId')
    if (customerId && customers.length > 0) {
      const match = customers.find((c: any) => c.id === customerId)
      if (match) {
        setCustomer(match.name)
        setCustomerId(match.id)
        setCustomerPhone(match.phone?.replace(/\s/g, '') || '')
      }
    }
  }, [searchParams, customers])

  const loading = productsLoading || customersLoading;
  const loadError = productsError || customersError;

  const filtered = useMemo(
    () => products.filter((p) => p.name?.toLowerCase().includes(query.toLowerCase())),
    [query, products],
  );

  const totalMrp = cart.reduce((s, i) => s + i.salePrice * i.qty, 0);
  const itemTaxDetails = cart.map(i => {
    const lineTotal = i.salePrice * i.qty;
    const taxable = i.gstRate ? Math.round(lineTotal * 100 / (100 + i.gstRate)) : lineTotal;
    return { ...i, lineTotal, taxable, gstAmount: lineTotal - taxable };
  });
  const subtotal = itemTaxDetails.reduce((s, i) => s + i.taxable, 0);
  const tax = itemTaxDetails.reduce((s, i) => s + i.gstAmount, 0);
  const total = totalMrp;

  const addToCart = (p: Product) => {
    setCart((c) => {
      const ex = c.find((i) => i.id === p.id);
      if (ex) return c.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...c, { ...p, qty: 1 }];
    });
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20);
    toast.success(`${p.name} added to cart`, {
      icon: "🛒",
      duration: 1500,
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((c) =>
      c.flatMap((i) =>
        i.id === id ? (i.qty + delta <= 0 ? [] : [{ ...i, qty: i.qty + delta }]) : [i],
      ),
    );
  };

  const handlePay = async (method: "upi" | "cash" | "udhar") => {
    if (submitting) return;
    setSubmitting(true);
    setShowPay(false);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(80);

    const result = await handlePOSInvoice(cart, customer, customerPhone || "", method, customerId);

    if (!result.success) {
      setSubmitting(false);
      toast.error(result.error || "Failed to create invoice", {
        description: "Please check stock levels or try again.",
        duration: 4000,
      });
      return;
    }

    const invoiceId = (result.data as any)?.id;
    const invoiceTotal = Math.round(totalMrp);

    // Immediately create recovery case so it appears in the queue
    if (invoiceId && customerId && method === 'udhar') {
      fetch('/api/recovery/case', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          invoiceId,
          customerId,
          amount: invoiceTotal,
          customerName: customer,
          customerPhone: customerPhone || '',
        }),
      }).catch((err) => console.warn('[POS] Recovery case error:', err));
    }

    const inv: POSSuccessResult = {
      id: invoiceId,
      number: (result.data as any)?.invoiceNumber || invoiceId?.slice(0, 8).toUpperCase(),
      party: customer,
      partyPhone: customerPhone,
      amount: invoiceTotal,
      status: "synced",
      date: "Just now",
      method,
      items: cart.map((c) => ({ name: c.name, hsn: c.hsn, qty: c.qty, price: c.salePrice, gstRate: c.gstRate })),
    };

    // Emit event so dashboard knows to refresh queue
    window.dispatchEvent(new CustomEvent('billzo:invoice-created', {
      detail: { invoiceId, method, amount: invoiceTotal }
    }));

    // Navigate to invoice communication screen
    if (invoiceId) {
      router.push(`/send/${invoiceId}`)
      return
    }
    setSuccess(inv);
  };

  const closeSuccess = () => {
    setSuccess(null);
    setCart([]);
    setCustomer("Walk-in Customer");
    setCustomerId("");
    setCustomerPhone(undefined);
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto">
        <div className="flex gap-2 mb-6">
          <div className="flex-1 h-14 bg-muted animate-pulse rounded-xl" />
          <div className="w-[88px] h-14 bg-muted animate-pulse rounded-xl" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border bg-card p-4 space-y-3">
              <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
              <div className="h-8 bg-muted animate-pulse rounded w-1/2" />
              <div className="h-3 bg-muted animate-pulse rounded w-1/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto">
      {loadError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={() => setRetryCount(c => c + 1)}>
            Retry
          </Button>
        </div>
      )}
      {(syncHealth.failedCount > 0 || syncHealth.conflictCount > 0) && (
        <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 flex items-center justify-between gap-3">
          <span>
            {syncHealth.failedCount + syncHealth.conflictCount} billing sync operation{syncHealth.failedCount + syncHealth.conflictCount > 1 ? "s" : ""} failed. Inventory may be stale until retry succeeds.
          </span>
          <Button size="sm" variant="outline" onClick={() => retryProductSync()}>
            Retry sync
          </Button>
        </div>
      )}
      <div className="grid lg:grid-cols-[1fr_400px] gap-6">
        <div>
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products… (instant)"
                className="w-full h-14 rounded-xl border-2 border-input bg-card pl-11 pr-4 text-base font-medium focus:border-primary focus:outline-none transition-colors"
              />
            </div>
            <button 
              onClick={() => setShowScanner(true)}
              className="h-14 px-5 rounded-xl bg-secondary text-secondary-foreground border-2 border-input hover:border-primary transition-colors flex items-center gap-2 font-medium"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              Scan
            </button>
          </div>

          {products.length === 0 ? (
            <EmptyState
              icon={<Package className="h-12 w-12" />}
              title="No products yet"
              description="Add products to start billing"
              action={<Button onClick={() => router.push("/products/add")}><Plus className="h-4 w-4" /> Add Product</Button>}
            />
          ) : (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((p) => {
                const inCart = cart.find((i) => i.id === p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className={`text-left rounded-2xl border bg-card p-4 transition-transform active:scale-95 hover:border-primary/40 hover:shadow-md ${
                      inCart ? "border-primary shadow-lg" : "border-border"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="text-sm font-semibold leading-snug line-clamp-2">{p.name}</h3>
                      {inCart && (
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                          {inCart.qty}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <div>
                        <div className="text-lg font-bold">{formatINR(p.salePrice)}</div>
                        <div className="text-[11px] text-muted-foreground">GST {p.gstRate}%</div>
                      </div>
                      <div className={`text-[11px] font-medium ${(p.stock || 0) < (p.lowStockAt || 20) ? "text-yellow-600" : "text-green-600"}`}>
                        {p.stock} {p.unit}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="hidden lg:block">
          <CartPanel
            cart={cart}
            customer={customer}
            onCustomer={() => setShowCustomer(true)}
            onQty={updateQty}
            onClear={() => setCart([])}
            subtotal={subtotal}
            tax={tax}
            total={total}
            onPay={() => setShowPay(true)}
          />
        </div>
      </div>

      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-20 left-0 right-0 z-30 px-4 animate-in slide-in-from-bottom">
          <button
            onClick={() => setShowCart(true)}
            className="w-full rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-4 shadow-lg flex items-center justify-between"
          >
            <span className="text-sm font-medium">{cart.reduce((s, i) => s + i.qty, 0)} items</span>
            <span className="text-lg font-bold">{formatINR(total)} →</span>
          </button>
        </div>
      )}

      {showCart && (
        <Sheet onClose={() => setShowCart(false)} title="Cart">
          <CartPanel
            cart={cart}
            customer={customer}
            onCustomer={() => setShowCustomer(true)}
            onQty={updateQty}
            onClear={() => { setCart([]); setShowCart(false) }}
            subtotal={subtotal}
            tax={tax}
            total={total}
            onPay={() => { setShowCart(false); setShowPay(true) }}
          />
        </Sheet>
      )}

      {showPay && (
        <Sheet onClose={() => setShowPay(false)} title="Collect payment">
          <div className="space-y-3">
            <div className="rounded-xl bg-secondary p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">To collect</div>
                <div className="text-3xl font-bold mt-1">{formatINR(total)}</div>
              </div>
              <button onClick={() => setShowCustomer(true)} className="text-xs text-primary inline-flex items-center gap-1 font-medium">
                <User className="h-3 w-3" /> {customer}
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-input px-4 py-2.5">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                value={customerPhone || ''}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="Phone (optional — for WhatsApp invoice)"
                type="tel"
                className="flex-1 bg-transparent text-sm focus:outline-none"
              />
            </div>
            {submitting ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Creating invoice...</span>
              </div>
            ) : ([
              { l: "UPI", desc: "QR / link to customer", method: "upi" as const },
              { l: "Cash", desc: "Mark as paid", method: "cash" as const },
              { l: "Credit (Udhar)", desc: "Customer will pay later", method: "udhar" as const },
            ]).map((m) => (
              <button
                key={m.l}
                onClick={() => handlePay(m.method)}
                className="w-full rounded-xl border-2 border-input p-4 flex items-center justify-between hover:border-primary hover:bg-secondary/40 transition-colors text-left"
              >
                <div>
                  <div className="font-semibold">{m.l}</div>
                  <div className="text-xs text-muted-foreground">{m.desc}</div>
                </div>
                <span className="text-primary font-medium text-sm">→</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {showCustomer && (
        <Sheet onClose={() => { setShowCustomer(false); setCustomerSearch(""); }} title="Select customer">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              placeholder="Search by name or phone…"
              autoFocus
              className="w-full rounded-xl border border-input bg-background pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            <button
              onClick={() => {
                setCustomer("Walk-in Customer");
                setCustomerId("");
                setCustomerPhone(undefined);
                setShowCustomer(false);
                setCustomerSearch("");
              }}
              className="w-full text-left rounded-lg p-3 hover:bg-secondary"
            >
              <div className="font-medium text-sm">Walk-in Customer</div>
              <div className="text-xs text-muted-foreground">No details</div>
            </button>
            {customers.filter(p => {
              if (!customerSearch.trim()) return true;
              const q = customerSearch.toLowerCase();
              return p.name?.toLowerCase().includes(q) || p.phone?.toLowerCase().includes(q);
            }).map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setCustomer(p.name);
                  setCustomerId(p.id);
                  setCustomerPhone(p.phone.replace(/\s/g, ""));
                  setShowCustomer(false);
                  setCustomerSearch("");
                }}
                className="w-full text-left rounded-lg p-3 hover:bg-secondary flex justify-between items-center"
              >
                <div>
                  <div className="font-medium text-sm">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.phone || "No phone"}</div>
                </div>
                {p.pending > 0 && (
                  <span className="text-xs font-semibold text-yellow-600">{formatINR(p.pending)} due</span>
                )}
              </button>
            ))}
            {customerSearch.trim() && customers.filter(p => {
              const q = customerSearch.toLowerCase();
              return p.name?.toLowerCase().includes(q) || p.phone?.toLowerCase().includes(q);
            }).length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No parties match "{customerSearch}"
              </div>
            )}
          </div>
        </Sheet>
      )}

      {success && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center bg-background/80 backdrop-blur animate-in fade-in" onClick={closeSuccess}>
          <div
            className="w-full lg:max-w-md bg-card lg:rounded-3xl rounded-t-3xl border border-border shadow-lg p-6 animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-500 text-white shadow-lg">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="mt-3 text-xl font-bold">Invoice {success.number}</h2>
              <div className="text-3xl font-bold mt-1">{formatINR(success.amount)}</div>
              {success.method === 'udhar' && (
                <div className="mt-2 text-sm text-amber-600 bg-amber-50 rounded-lg p-2">
                  ✓ Added to recovery queue
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{success.party}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  value={success.partyPhone || ''}
                  onChange={e => setSuccess({ ...success, partyPhone: e.target.value })}
                  placeholder="Add phone for WhatsApp"
                  type="tel"
                  className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button 
                onClick={async () => {
                  if (success.partyPhone) {
                    await db().invoices.update(success.id, { customerPhone: success.partyPhone })
                    scheduleBackgroundSync()
                  }
                  const itemsForPdf = (success.items || []).map((i) => {
                    const lineTotal = i.price * i.qty;
                    const taxable = i.gstRate ? Math.round(lineTotal * 100 / (100 + i.gstRate)) : lineTotal;
                    return { name: i.name, hsn: i.hsn, qty: i.qty, price: i.price, gstRate: i.gstRate, taxable };
                  });
                  const pdfSubtotal = itemsForPdf.reduce((s, i) => s + i.taxable, 0);
                  const pdfTax = success.amount - pdfSubtotal;
                  const pdfData = {
                    invoiceNumber: success.number,
                    date: new Date().toLocaleDateString('en-IN'),
                    customerName: success.party,
                    customerPhone: success.partyPhone,
                    items: itemsForPdf,
                    subtotal: pdfSubtotal,
                    tax: pdfTax,
                    total: success.amount,
                    businessName: tenantData?.name || getCookie('bz_tenant_name') || 'My Shop',
                    businessPhone: tenantData?.phone,
                    businessGstin: tenantData?.gstin,
                    businessPan: tenantData?.pan,
                    businessAddress: tenantData?.address,
                    bankDetails: tenantData?.bankDetails,
                    upiId: tenantData?.upiId,
                    whiteLabel: tenantData?.whiteLabel,
                    placeOfSupply: tenantData?.gstin ? tenantData.gstin.slice(0, 2) : undefined,
                  }
                  await downloadInvoicePDF(pdfData)
                }}
                className="flex-1 rounded-xl border border-input py-3 text-sm font-medium hover:bg-secondary transition-colors flex items-center justify-center gap-2"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
                PDF
              </button>
              <button
                onClick={async () => {
                  if (!success.partyPhone) {
                    toast.error('Please enter a phone number to send via WhatsApp');
                    return;
                  }
                  if (success.partyPhone) {
                    await db().invoices.update(success.id, { customerPhone: success.partyPhone })
                    scheduleBackgroundSync()
                  }
                  const itemsForPdf = (success.items || []).map((i) => {
                    const lineTotal = i.price * i.qty;
                    const taxable = i.gstRate ? Math.round(lineTotal * 100 / (100 + i.gstRate)) : lineTotal;
                    return { name: i.name, hsn: i.hsn, qty: i.qty, price: i.price, gstRate: i.gstRate, taxable };
                  });
                  const pdfSubtotal = itemsForPdf.reduce((s, i) => s + i.taxable, 0);
                  const pdfTax = success.amount - pdfSubtotal;
                  const pdfData = {
                    invoiceNumber: success.number,
                    date: new Date().toLocaleDateString('en-IN'),
                    customerName: success.party,
                    customerPhone: success.partyPhone,
                    items: itemsForPdf,
                    subtotal: pdfSubtotal,
                    tax: pdfTax,
                    total: success.amount,
                    businessName: tenantData?.name || getCookie('bz_tenant_name') || 'My Shop',
                    businessPhone: tenantData?.phone,
                    businessGstin: tenantData?.gstin,
                    businessPan: tenantData?.pan,
                    bankDetails: tenantData?.bankDetails,
                    upiId: tenantData?.upiId,
                    whiteLabel: tenantData?.whiteLabel,
                  }
                  const waLink = getWhatsAppShareLink(pdfData)
                  window.open(waLink, '_blank')
                }}
                className="flex-1 rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors bg-green-500 text-white hover:bg-green-600"
              >

                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.08 6.974 2.897a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </button>
            </div>
            
            <div className="mt-3 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={closeSuccess}>
                New sale
              </Button>
              {success.method === 'udhar' && (
                <Button 
                  className="flex-1"
                  onClick={() => {
                    closeSuccess();
                    router.push('/dashboard');
                  }}
                >
                  View Queue →
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Barcode scanning removed in V2 */}
    </div>
  );
}

function CartPanel({
  cart,
  customer,
  onCustomer,
  onQty,
  onClear,
  subtotal,
  tax,
  total,
  onPay,
}: {
  cart: CartItem[];
  customer: string;
  onCustomer: () => void;
  onQty: (id: string, delta: number) => void;
  onClear: () => void;
  subtotal: number;
  tax: number;
  total: number;
  onPay: () => void;
}) {
  return (
    <div className="sticky top-24 rounded-2xl border border-border bg-card overflow-hidden flex flex-col max-h-[calc(100vh-8rem)]">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold">Cart</h2>
        {cart.length > 0 && (
          <button onClick={onClear} className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-red-600">
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        )}
      </div>
      <button onClick={onCustomer} className="m-3 mb-0 rounded-lg bg-secondary p-3 text-left flex items-center gap-2.5 hover:bg-secondary/80 transition-colors">
        <User className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">Customer</div>
          <div className="text-sm font-medium truncate">{customer}</div>
        </div>
        <span className="text-xs text-primary font-medium">Change</span>
      </button>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {cart.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Tap a product to add it
          </div>
        ) : (
          cart.map((i) => (
            <div key={i.id} className="rounded-lg border border-border p-3">
              <div className="flex justify-between items-start gap-2">
                <div className="text-sm font-medium leading-snug">{i.name}</div>
                <div className="text-sm font-bold whitespace-nowrap">
                  {formatINR(i.salePrice * i.qty)}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-[11px] text-muted-foreground">{formatINR(i.salePrice)} × {i.qty}</div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onQty(i.id, -1)} className="grid h-9 w-9 place-items-center rounded-md bg-secondary hover:bg-secondary/70" aria-label={`Decrease quantity of ${i.name}`}>
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-9 text-center text-sm font-semibold">{i.qty}</span>
                  <button onClick={() => onQty(i.id, 1)} className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90" aria-label={`Increase quantity of ${i.name}`}>
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {cart.length > 0 && (
        <div className="border-t border-border p-4 space-y-3 bg-secondary/30">
          <div className="space-y-1.5 text-sm">
            <Row label="Subtotal" value={formatINR(subtotal)} />
            <Row label="GST" value={formatINR(tax)} />
            <Row label="Total" value={formatINR(total)} bold />
          </div>
          <button className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90" onClick={onPay}>
            Create Invoice
          </button>
        </div>
      )}
    </div>
  );
}

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className={`flex justify-between ${bold ? "text-base font-bold pt-1.5 border-t border-border" : "text-muted-foreground"}`}>
    <span>{label}</span>
    <span className="text-foreground">{value}</span>
  </div>
);

const Sheet = ({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) => (
  <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center bg-background/70 backdrop-blur animate-in fade-in" onClick={onClose}>
    <div
      className="w-full lg:max-w-md bg-card lg:rounded-2xl rounded-t-3xl border border-border shadow-lg p-6 animate-in slide-in-from-bottom"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-bold">{title}</h3>
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-secondary" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);
