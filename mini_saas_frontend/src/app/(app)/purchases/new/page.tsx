'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { 
  ArrowLeft, 
  Store, 
  FileCheck, 
  Save, 
  AlertCircle
} from 'lucide-react'

function NewPurchaseContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isFromScan = searchParams?.get('fromScan') === 'true'

  const [supplier, setSupplier] = useState('')
  const [gstin, setGstin] = useState('')
  const [amount, setAmount] = useState('')
  const [gstAmount, setGstAmount] = useState('')
  const [status, setStatus] = useState('idle') // idle, autofilling, ready

  useEffect(() => {
    if (isFromScan) {
      setStatus('autofilling')
      // Simulate retrieving OCR extracted data
      setTimeout(() => {
        setSupplier('A1 Electronics Distributors')
        setGstin('27AAAAA0000A1Z5')
        setAmount('8500')
        setGstAmount('1530')
        setStatus('ready')
      }, 1000)
    } else {
      setStatus('ready')
    }
  }, [isFromScan])

  const handleSave = () => {
    // Save purchase logic
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pl-20 lg:pl-64 animate-fade-in">
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition-all">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-lg font-bold text-foreground">Add Purchase</h1>
        </div>
      </header>

      <div className="p-4 max-w-3xl mx-auto space-y-6">
        {status === 'autofilling' && (
          <div className="card-base p-4 bg-primary/5 border-primary/20 flex items-start gap-3 animate-pulse">
            <FileCheck className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-primary">Autofilling from scan...</p>
              <p className="text-xs text-muted-foreground mt-1">Reading supplier and tax details.</p>
            </div>
          </div>
        )}

        {status === 'ready' && isFromScan && (
          <div className="card-base p-4 bg-success/5 border-success/20 flex items-start gap-3">
            <FileCheck className="w-5 h-5 text-success mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-success">OCR Data Extracted</p>
              <p className="text-xs text-muted-foreground mt-1">Please verify the details below before saving.</p>
            </div>
          </div>
        )}

        <section className="card-base p-4 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Store className="w-4 h-4" /> Supplier Details
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Supplier Name</label>
              <input 
                type="text" 
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="E.g., Wholesale Mart"
                className="input-base"
                disabled={status === 'autofilling'}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">GSTIN</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  placeholder="27AAAAA..."
                  className="input-base uppercase"
                  disabled={status === 'autofilling'}
                />
                {gstin.length === 15 && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-success-soft text-success text-[10px] px-2 py-0.5 rounded-full font-bold">
                    VERIFIED
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="card-base p-4 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Amounts
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Total Amount (₹)</label>
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-base text-lg font-bold"
                disabled={status === 'autofilling'}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">GST Included (₹)</label>
              <input 
                type="number" 
                value={gstAmount}
                onChange={(e) => setGstAmount(e.target.value)}
                className="input-base"
                disabled={status === 'autofilling'}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-20 lg:left-64 p-4 bg-background border-t border-border z-40 pb-safe">
        <div className="max-w-3xl mx-auto">
          <button 
            onClick={handleSave}
            disabled={status === 'autofilling'}
            className="w-full btn-base py-3.5 bg-primary text-primary-foreground shadow-elegant text-base font-semibold disabled:opacity-50"
          >
            <Save className="w-5 h-5 mr-2" /> Save Purchase
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NewPurchasePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>}>
      <NewPurchaseContent />
    </Suspense>
  )
}
