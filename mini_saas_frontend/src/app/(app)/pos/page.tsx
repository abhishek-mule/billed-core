"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Minus, Trash2, X, CheckCircle2, Printer, User } from "lucide-react";
import { db } from "@/lib/billzo/db";
import { toast } from "sonner";

const formatINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

type CartItem = { id: string; name: string; price: number; gst: number; stock: number; qty: number; hsn: string; unit: string };

export default function POSPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<string>("Walk-in Customer");
  const [customerPhone, setCustomerPhone] = useState<string | undefined>(undefined);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
      const [productsData, partiesData] = await Promise.all([
        db.products.where("tenantId").equals(tenantId).toArray(),
        db.customers.where("tenantId").equals(tenantId).toArray(),
      ]);
      setProducts(productsData);
      setParties(partiesData);
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

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const tax = cart.reduce((s, i) => s + (i.price * i.qty * i.gst) / 100, 0);
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
    if (navigator.vibrate) navigator.vibrate(80);
    
    const invNumber = `INV-${Math.floor(1000 + Math.random() * 9000)}`;
    const inv = {
      id: `local-${Date.now()}`,
      number: invNumber,
      party: customer,
      partyPhone: customerPhone,
      amount: Math.round(total),
      status: "pending",
      date: new Date().toISOString(),
      method,
      items: cart.map((c) => ({ name: c.name, hsn: c.hsn, qty: c.qty, price: c.price, gst: c.gst })),
    };

    try {
      const tenantId = localStorage.getItem("tenantId");
      if (tenantId) {
        await db.invoices.add({
          ...inv,
          tenantId,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Failed to save invoice:", error);
    }

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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Point of Sale</h1>
      
      <div className="grid lg:grid-cols-[1fr_400px] gap-6">
        <div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full h-14 rounded-xl border-2 border-input bg-card pl-11 pr-4 text-base font-medium focus:border-primary focus:outline-none"
            />
          </div>

          {products.length === 0 ? (
            <div className="mt-8 text-center text-muted-foreground">
              <p>No products found. Add products first.</p>
              <button
                onClick={() => router.push("/products/add")}
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-xl"
              >
                Add Product
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
                    className={`text-left rounded-2xl border bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all ${inCart ? "border-primary shadow-lg" : "border-border"}`}
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
                        <div className="text-lg font-bold">{formatINR(p.price || 0)}</div>
                        <div className="text-[11px] text-muted-foreground">GST {p.gst || 0}%</div>
                      </div>
                      <div className={`text-[11px] font-medium ${(p.stock || 0) < 20 ? "text-orange-600" : "text-green-600"}`}>
                        {p.stock || 0} {p.unit || "pcs"}
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
        <div className="lg:hidden fixed bottom-20 left-0 right-0 z-30 px-4">
          <button
            onClick={() => setShowPay(true)}
            className="w-full rounded-2xl bg-primary text-primary-foreground p-4 shadow-lg flex items-center justify-between"
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
            {[
              { l: "UPI", desc: "QR / link to customer", method: "upi" as const },
              { l: "Cash", desc: "Mark as paid", method: "cash" as const },
              { l: "Udhar (Credit)", desc: "Add to ledger", method: "udhar" as const },
            ].map((m) => (
              <button
                key={m.l}
                onClick={() => handlePay(m.method)}
                className="w-full rounded-xl border-2 border-input p-4 flex items-center justify-between hover:border-primary hover:bg-secondary/40 text-left"
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
              onClick={() => { setCustomer("Walk-in Customer"); setCustomerPhone(undefined); setShowCustomer(false); }}
              className="w-full text-left rounded-lg p-3 hover:bg-secondary"
            >
              <div className="font-medium text-sm">Walk-in Customer</div>
              <div className="text-xs text-muted-foreground">No details</div>
            </button>
            {parties.filter((p) => p.type === "customer").map((p) => (
              <button
                key={p.id}
                onClick={() => { setCustomer(p.name); setCustomerPhone(p.phone); setShowCustomer(false); }}
                className="w-full text-left rounded-lg p-3 hover:bg-secondary flex justify-between items-center"
              >
                <div>
                  <div className="font-medium text-sm">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.phone}</div>
                </div>
                {(p.pending || 0) > 0 && (
                  <span className="text-xs font-semibold text-orange-600">{formatINR(p.pending)} due</span>
                )}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {success && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center bg-background/80 backdrop-blur" onClick={closeSuccess}>
          <div className="w-full lg:max-w-md bg-card lg:rounded-3xl rounded-t-3xl border border-border p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-100 text-green-600">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="mt-3 text-xl font-bold">Invoice {success.number}</h2>
              <div className="text-3xl font-bold mt-1">{formatINR(success.amount)}</div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={closeSuccess} className="flex-1 rounded-xl border border-input py-3 text-sm font-medium hover:bg-secondary">
                New sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CartPanel({ cart, customer, onCustomer, onQty, onClear, subtotal, tax, total, onPay }: any) {
  return (
    <div className="sticky top-24 rounded-2xl border border-border bg-card overflow-hidden flex flex-col max-h-[calc(100vh-8rem)]">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold">Cart</h2>
        {cart.length > 0 && (
          <button onClick={onClear} className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-red-500">
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        )}
      </div>
      <button onClick={onCustomer} className="m-3 mb-0 rounded-lg bg-secondary p-3 text-left flex items-center gap-2.5 hover:bg-secondary/80">
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
          cart.map((i: CartItem) => (
            <div key={i.id} className="rounded-lg border border-border p-3">
              <div className="flex justify-between items-start gap-2">
                <div className="text-sm font-medium leading-snug">{i.name}</div>
                <div className="text-sm font-bold whitespace-nowrap">{formatINR(i.price * i.qty)}</div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-[11px] text-muted-foreground">{formatINR(i.price)} × {i.qty}</div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onQty(i.id, -1)} className="grid h-7 w-7 place-items-center rounded-md bg-secondary hover:bg-secondary/70">
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-7 text-center text-sm font-semibold">{i.qty}</span>
                  <button onClick={() => onQty(i.id, 1)} className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
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
          <button onClick={onPay} className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90">
            Generate & Send
          </button>
        </div>
      )}
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

function Sheet({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center bg-background/70 backdrop-blur" onClick={onClose}>
      <div className="w-full lg:max-w-md bg-card lg:rounded-2xl rounded-t-3xl border border-border p-6" onClick={(e) => e.stopPropagation()}>
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
}