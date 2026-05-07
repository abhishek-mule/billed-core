"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Minus, Trash2, X, CheckCircle2, MessageCircle, User, Printer, Loader2 } from "lucide-react";
import { db } from "@/lib/billzo/db";
import { getUsageLimits, incrementInvoiceCount } from "@/lib/billzo/usage";
import { PaywallModal } from "@/components/billzo/PaywallModal";

type CartItem = {
  id: string;
  name: string;
  hsn?: string;
  gstRate: number;
  salePrice: number;
  stock: number;
  qty: number;
  unit?: string;
};

const formatINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function POSPage() {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<string>("Walk-in Customer");
  const [customerPhone, setCustomerPhone] = useState<string | undefined>(undefined);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [usageLimits, setUsageLimits] = useState<any>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) {
        router.push("/login");
        return;
      }

      const [productData, customerData, usage] = await Promise.all([
        db().products.where("tenantId").equals(tenantId).toArray(),
        db().customers.where("tenantId").equals(tenantId).toArray(),
        getUsageLimits(tenantId),
      ]);

      setProducts(productData);
      setCustomers(customerData);
      setUsageLimits(usage);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(
    () => products.filter((p) => p.name?.toLowerCase().includes(query.toLowerCase())),
    [query, products],
  );

  const subtotal = cart.reduce((s, i) => s + i.salePrice * i.qty, 0);
  const tax = cart.reduce((s, i) => s + (i.salePrice * i.qty * i.gstRate) / 100, 0);
  const total = subtotal + tax;

  const addToCart = (p: any) => {
    setCart((c) => {
      const ex = c.find((i) => i.id === p.id);
      if (ex) return c.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...c, { ...p, qty: 1 }];
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
    setShowPay(false);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(80);

    try {
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) return;

      // Check usage limits
      const limits = await getUsageLimits(tenantId);
      if (!limits.canCreateInvoice) {
        setShowPaywall(true);
        return;
      }

      const invoiceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      await db().invoices.add({
        id: invoiceId,
        tenantId,
        customerId: "",
        customerName: customer,
        customerPhone: customerPhone || "",
        total: Math.round(total),
        paidAmount: method === "cash" || method === "upi" ? Math.round(total) : 0,
        status: method === "udhar" ? "unpaid" : "paid",
        dueAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: "pending",
        recoveryStage: "t0_soft",
        nextRecoveryAt: new Date().toISOString(),
        lastWhatsAppStatus: "queued",
        pdfUrl: `/invoice/${invoiceId}`,
        version: 1,
      });

      for (const item of cart) {
        await db().invoiceItems.add({
          id: `${invoiceId}-${item.id}`,
          tenantId,
          invoiceId,
          productId: item.id,
          name: item.name,
          qty: item.qty,
          price: item.salePrice,
          gstRate: item.gstRate,
          lineTotal: item.salePrice * item.qty,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      const inv: any = {
        id: invoiceId,
        number: invoiceId.slice(0, 8).toUpperCase(),
        party: customer,
        partyPhone: customerPhone,
        amount: Math.round(total),
        status: "synced",
        date: "Just now",
        method,
        items: cart.map((c) => ({ name: c.name, hsn: c.hsn, qty: c.qty, price: c.salePrice, gst: c.gstRate })),
      };

      // Increment invoice count
      await incrementInvoiceCount(tenantId);
      const newLimits = await getUsageLimits(tenantId);
      setUsageLimits(newLimits);

      setSuccess(inv);
    } catch (error) {
      console.error("Failed to create invoice:", error);
      console.error("Failed to create invoice");
    }
  };

  const closeSuccess = () => {
    setSuccess(null);
    setCart([]);
    setCustomer("Walk-in Customer");
    setCustomerPhone(undefined);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto">
      <div className="grid lg:grid-cols-[1fr_400px] gap-6">
        <div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products… (instant)"
              className="w-full h-14 rounded-xl border-2 border-input bg-card pl-11 pr-4 text-base font-medium focus:border-primary focus:outline-none transition-colors"
            />
          </div>

          {products.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-border bg-card p-12 text-center">
              <h3 className="text-lg font-semibold">No products yet</h3>
              <p className="text-muted-foreground mt-1">Add products to start billing</p>
              <button className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium" onClick={() => router.push("/products/add")}>
                <Plus className="h-4 w-4" /> Add Product
              </button>
            </div>
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
            onClick={() => setShowPay(true)}
            className="w-full rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-4 shadow-lg flex items-center justify-between"
          >
            <span className="text-sm font-medium">{cart.reduce((s, i) => s + i.qty, 0)} items</span>
            <span className="text-lg font-bold">{formatINR(total)} →</span>
          </button>
        </div>
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
            {([
              { l: "UPI", desc: "QR / link to customer", method: "upi" as const },
              { l: "Cash", desc: "Mark as paid", method: "cash" as const },
              { l: "Udhar (Credit)", desc: "Add to ledger", method: "udhar" as const },
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
        <Sheet onClose={() => setShowCustomer(false)} title="Select customer">
          <div className="space-y-1">
            <button
              onClick={() => {
                setCustomer("Walk-in Customer");
                setCustomerPhone(undefined);
                setShowCustomer(false);
              }}
              className="w-full text-left rounded-lg p-3 hover:bg-secondary"
            >
              <div className="font-medium text-sm">Walk-in Customer</div>
              <div className="text-xs text-muted-foreground">No details</div>
            </button>
            {customers.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setCustomer(p.name);
                  setCustomerPhone(p.phone.replace(/\s/g, ""));
                  setShowCustomer(false);
                }}
                className="w-full text-left rounded-lg p-3 hover:bg-secondary flex justify-between items-center"
              >
                <div>
                  <div className="font-medium text-sm">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.phone}</div>
                </div>
                {p.pending > 0 && (
                  <span className="text-xs font-semibold text-yellow-600">{formatINR(p.pending)} due</span>
                )}
              </button>
            ))}
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
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={closeSuccess} className="flex-1 rounded-xl border border-input py-3 text-sm font-medium hover:bg-secondary transition-colors">
                New sale
              </button>
            </div>
          </div>
        </div>
      )}

      <PaywallModal
        type="invoice"
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        currentCount={usageLimits?.currentInvoiceCount || 0}
        limit={usageLimits?.invoiceLimit || 3}
      />
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
                  <button onClick={() => onQty(i.id, -1)} className="grid h-7 w-7 place-items-center rounded-md bg-secondary hover:bg-secondary/70">
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-7 text-center text-sm font-semibold">{i.qty}</span>
                  <button onClick={() => onQty(i.id, 1)} className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
                    <Plus className="h-3 w-3" />
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
            Generate & Send
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
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-secondary">
          <X className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);