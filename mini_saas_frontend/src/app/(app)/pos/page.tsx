"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Minus, Trash2, X, CheckCircle2, MessageCircle, User, Printer, Loader2 } from "lucide-react";
import { db } from "@/lib/billzo/db";
import { getUsageLimits } from "@/lib/billzo/usage";
import { PaywallModal } from "@/components/billzo/PaywallModal";
import { downloadInvoicePDF, getWhatsAppShareLink } from "@/lib/billzo/pdf";
import { BarcodeScanner } from "@/components/billzo/BarcodeScanner";
import { handlePOSInvoice } from "@/lib/billzo/actions";
import { toast } from "sonner";

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

const formatINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

function getCookie(name: string) {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

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
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      function getCookie(name: string) {
        if (typeof document === 'undefined') return null
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
        return match ? match[2] : null
      }
      const tenantId = getCookie('bz_tenant')
      if (!tenantId) {
        router.push("/auth");
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
    setShowPay(false);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(80);

    const result = await handlePOSInvoice(cart, customer, customerPhone || "", method);

    if (!result.success) {
      if (result.blocked === 'paywall') {
        setShowPaywall(true);
        return;
      }
      console.error('POS invoice failed:', result.error);
      return;
    }

    const inv: any = {
      id: (result.data as any)?.id,
      number: (result.data as any)?.id?.slice(0, 8).toUpperCase(),
      party: customer,
      partyPhone: customerPhone,
      amount: Math.round(total),
      status: "synced",
      date: "Just now",
      method,
      items: cart.map((c) => ({ name: c.name, hsn: c.hsn, qty: c.qty, price: c.salePrice, gst: c.gstRate })),
    };
    const newLimits = await getUsageLimits(getCookie('bz_tenant') || '');
    if (newLimits) setUsageLimits(newLimits);

    setSuccess(inv);
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
              <button 
                onClick={() => {
                  const pdfData = {
                    invoiceNumber: success.number,
                    date: new Date().toLocaleDateString('en-IN'),
                    customerName: success.party,
                    customerPhone: success.partyPhone,
                    items: success.items || [],
                    subtotal: Math.round(success.amount / 1.18),
                    tax: Math.round(success.amount - Math.round(success.amount / 1.18)),
                    total: success.amount,
                    businessName: getCookie('bz_tenant_name') || getCookie('bz_tenant')?.slice(-8) || 'My Shop',
                  }
                  downloadInvoicePDF(pdfData)
                }}
                className="flex-1 rounded-xl border border-input py-3 text-sm font-medium hover:bg-secondary transition-colors flex items-center justify-center gap-2"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
                PDF
              </button>
              <button 
                onClick={() => {
                  const pdfData = {
                    invoiceNumber: success.number,
                    date: new Date().toLocaleDateString('en-IN'),
                    customerName: success.party,
                    customerPhone: success.partyPhone,
                    items: success.items || [],
                    subtotal: Math.round(success.amount / 1.18),
                    tax: Math.round(success.amount - Math.round(success.amount / 1.18)),
                    total: success.amount,
                    businessName: getCookie('bz_tenant_name') || getCookie('bz_tenant')?.slice(-8) || 'My Shop',
                  }
                  const waLink = getWhatsAppShareLink(pdfData)
                  window.open(waLink, '_blank')
                }}
                className="flex-1 rounded-xl bg-green-500 text-white py-3 text-sm font-medium hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.08 6.974 2.897a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </button>
            </div>
            <button onClick={closeSuccess} className="w-full mt-2 rounded-xl border border-input py-3 text-sm font-medium hover:bg-secondary transition-colors">
              New sale
            </button>
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

      {showScanner && (
        <BarcodeScanner 
          onClose={() => setShowScanner(false)} 
          onScan={(code) => {
            setShowScanner(false);
            const product = products.find(p => p.barcode === code);
            if (product) {
              addToCart(product);
              setQuery("");
            } else {
              toast.error(`Product not found!`, {
                description: `Barcode: ${code}`,
                action: {
                  label: "Add New",
                  onClick: () => router.push(`/products/add?barcode=${code}`)
                }
              });
            }
          }} 
        />
      )}
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