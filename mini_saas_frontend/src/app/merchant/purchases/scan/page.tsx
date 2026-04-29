'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  FileText, 
  Upload, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  ChevronDown, 
  Search,
  Sparkles,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Save,
  Rocket,
  Loader2
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

// Mock extracted data (would come from OCR in production)
const mockExtractedData = {
  supplierGstin: '27AABCU9603R1ZM',
  supplierName: 'BALAJI TRADERS',
  invoiceNumber: 'BT/23-24/0892',
  invoiceDate: '2024-10-15',
  lineItems: [
    { name: 'Super Cement 50kg', qty: 10, rate: 1450, taxRate: 28, amount: 14500 },
    { name: 'Steel TMT 12mm', qty: 20, rate: 1600, taxRate: 18, amount: 32000 }
  ],
  subtotal: 46500,
  cgst: 6510,
  sgst: 6510,
  igst: 0,
  total: 46500,
  grandTotal: 59520
}

export default function PurchaseScanPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [data] = useState(mockExtractedData)

  const handleSave = async (asDraft: boolean) => {
    try {
      setSaving(true)
      
      const res = await fetch('/api/merchant/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseInvoiceNumber: data.invoiceNumber,
          supplierName: data.supplierName,
          supplierGstin: data.supplierGstin,
          invoiceDate: data.invoiceDate,
          lineItems: data.lineItems,
          subtotal: data.subtotal,
          cgst: data.cgst,
          sgst: data.sgst,
          igst: data.igst,
          total: data.total,
          grandTotal: data.grandTotal,
          status: asDraft ? 'DRAFT' : 'UNPAID',
          eligibleForItc: true
        })
      })

      const result = await res.json()

      if (result.success) {
        toast.success(asDraft ? 'Saved as draft' : 'Purchase saved to ledger')
        router.push('/merchant/purchases')
      } else {
        toast.error(result.error || 'Failed to save')
      }
    } catch (error) {
      console.error('Save error:', error)
      toast.error('Failed to save purchase')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 pb-10 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
           <h1 className="text-2xl font-black text-gray-900 tracking-tight">Review Scanned Purchase</h1>
           <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
             <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
             <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">AI Extracted</span>
           </div>
        </div>
        <div className="flex items-center gap-3">
           <button className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-xl font-bold text-sm text-gray-600 hover:bg-gray-50 transition-all">
             <Upload className="w-4 h-4" />
             Upload Another
           </button>
           <button className="p-2 text-gray-400 hover:text-gray-600">
             <X className="w-5 h-5" />
             <span className="sr-only">Discard</span>
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Document Preview */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
            <div className="flex items-center gap-2 text-gray-500 font-bold text-xs">
              <FileText className="w-4 h-4" />
              invoice_october_supplier.pdf
            </div>
            <div className="flex items-center gap-2">
              <button className="p-1.5 hover:bg-white rounded-lg transition-colors shadow-sm"><ZoomIn className="w-4 h-4 text-gray-400" /></button>
              <button className="p-1.5 hover:bg-white rounded-lg transition-colors shadow-sm"><ZoomOut className="w-4 h-4 text-gray-400" /></button>
              <button className="p-1.5 hover:bg-white rounded-lg transition-colors shadow-sm"><Maximize2 className="w-4 h-4 text-gray-400" /></button>
            </div>
          </div>
          <div className="flex-1 p-8 bg-gray-100 flex items-center justify-center relative overflow-hidden">
             {/* Mock PDF Content */}
             <div className="w-full h-full bg-white shadow-2xl rounded-sm p-10 flex flex-col gap-8 max-w-md border border-gray-200 transform scale-90 md:scale-100 transition-transform">
                <div className="flex justify-between items-start">
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight">BALAJI TRADERS</h2>
                  <div className="text-right text-[10px] text-gray-400">INVOICE #BT/23-24/0892</div>
                </div>

                <div className="space-y-1">
                  <div className="relative group">
                    <div className="absolute -inset-1 bg-emerald-100/50 rounded transition-opacity" />
                    <span className="relative text-xs font-bold text-emerald-700">GSTIN: 27AABCU9603R1ZM</span>
                  </div>
                  <div className="relative group">
                    <div className="absolute -inset-1 bg-emerald-100/50 rounded transition-opacity" />
                    <span className="relative text-xs font-bold text-emerald-700">Invoice No: BT/23-24/0892</span>
                  </div>
                </div>

                <div className="mt-4 flex-1">
                   <div className="grid grid-cols-12 border-b border-gray-100 pb-2 mb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                     <div className="col-span-8">Description</div>
                     <div className="col-span-4 text-right">Total</div>
                   </div>
                   <div className="space-y-4">
                     <div className="grid grid-cols-12 text-sm">
                       <div className="col-span-8 font-bold text-gray-800">Super Cement 50kg</div>
                       <div className="col-span-4 text-right font-black">₹14,500.00</div>
                     </div>
                     <div className="grid grid-cols-12 text-sm">
                       <div className="col-span-8 font-bold text-gray-800">Steel TMT 12mm</div>
                       <div className="col-span-4 text-right font-black">₹32,000.00</div>
                     </div>
                   </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-end">
                   <div className="text-right">
                     <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest block">Grand Total</span>
                     <span className="text-xl font-black text-gray-900">₹46,500.00</span>
                   </div>
                </div>
             </div>
             
             {/* AI Scan Overlay Effect */}
             <motion.div 
               animate={{ top: ['0%', '100%', '0%'] }}
               transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
               className="absolute left-0 right-0 h-0.5 bg-indigo-500/30 shadow-[0_0_15px_rgba(79,70,229,0.5)] z-20"
             />
          </div>
        </div>

        {/* Right: Extracted Fields */}
        <div className="lg:col-span-7 space-y-6">
          {/* Supplier Details */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6">Supplier Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-gray-500">Supplier GSTIN</label>
                  <span className="text-[10px] font-black text-emerald-500 uppercase">High Match</span>
                </div>
                <div className="relative">
                  <input type="text" defaultValue="27AABCU9603R1ZM" className="w-full bg-gray-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none ring-2 ring-emerald-500/10" />
                  <CheckCircle2 className="absolute right-4 top-3.5 w-4 h-4 text-emerald-500" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-gray-500">Supplier Name (Auto-fetched)</label>
                  <span className="text-[10px] font-black text-emerald-500 uppercase">High Match</span>
                </div>
                <div className="relative">
                  <input type="text" defaultValue="Balaji Traders" className="w-full bg-gray-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none ring-2 ring-emerald-500/10" />
                  <CheckCircle2 className="absolute right-4 top-3.5 w-4 h-4 text-emerald-500" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-gray-500">Invoice Number</label>
                  <span className="text-[10px] font-black text-emerald-500 uppercase">High Match</span>
                </div>
                <div className="relative">
                  <input type="text" defaultValue="BT/23-24/0892" className="w-full bg-gray-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none ring-2 ring-emerald-500/10" />
                  <CheckCircle2 className="absolute right-4 top-3.5 w-4 h-4 text-emerald-500" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-gray-500">Invoice Date</label>
                  <span className="text-[10px] font-black text-amber-500 uppercase">Review</span>
                </div>
                <div className="relative">
                  <input type="text" defaultValue="18 Oct 2023" className="w-full bg-amber-50/50 border border-amber-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 focus:outline-none ring-2 ring-amber-500/10" />
                  <FileText className="absolute right-4 top-3.5 w-4 h-4 text-amber-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Item Mapping */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Line Items & Stock Mapping</h3>
              <span className="px-2 py-1 bg-gray-50 rounded text-[10px] font-bold text-gray-500 uppercase">2 Items Extracted</span>
            </div>

            <div className="space-y-4">
              {/* Item 1 */}
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 relative overflow-hidden group transition-all hover:shadow-md">
                 <div className="absolute top-0 left-0 bottom-0 w-1 bg-emerald-500" />
                 <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                   <div className="md:col-span-5 space-y-1">
                     <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Scanned Item Name</span>
                     <div className="bg-white border border-gray-100 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 shadow-sm">
                       Super Cement 50kg
                     </div>
                   </div>
                   <div className="md:col-span-1 flex items-center justify-center">
                     <ArrowRight className="w-4 h-4 text-gray-300" />
                   </div>
                   <div className="md:col-span-6 space-y-1">
                     <div className="flex justify-between items-center">
                       <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Map to Billzo</span>
                       <span className="text-[9px] font-black text-emerald-500 uppercase">Auto-Matched</span>
                     </div>
                     <div className="relative group cursor-pointer">
                       <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-sm font-bold text-emerald-700 flex justify-between items-center group-hover:bg-emerald-100 transition-colors">
                         Ultratech Cement 50kg
                         <ChevronDown className="w-4 h-4" />
                       </div>
                     </div>
                   </div>
                 </div>
                 <div className="mt-4 grid grid-cols-3 gap-4">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Qty</span>
                      <span className="text-sm font-black text-gray-900">50</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Rate (₹)</span>
                      <span className="text-sm font-black text-gray-900">290.00</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Amount</span>
                      <span className="text-sm font-black text-gray-900">14,500.00</span>
                    </div>
                 </div>
              </div>

              {/* Item 2 */}
              <div className="bg-amber-50/20 border border-amber-100/50 rounded-2xl p-5 relative overflow-hidden group transition-all hover:shadow-md">
                 <div className="absolute top-0 left-0 bottom-0 w-1 bg-amber-400" />
                 <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                   <div className="md:col-span-5 space-y-1">
                     <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Scanned Item Name</span>
                     <div className="bg-white border border-gray-100 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 shadow-sm">
                       Steel TMT 12mm
                     </div>
                   </div>
                   <div className="md:col-span-1 flex items-center justify-center">
                     <ArrowRight className="w-4 h-4 text-gray-300" />
                   </div>
                   <div className="md:col-span-6 space-y-1">
                     <div className="flex justify-between items-center">
                       <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Map to Billzo</span>
                       <span className="text-[9px] font-black text-amber-500 uppercase">Review Mapped</span>
                     </div>
                     <div className="relative group cursor-pointer">
                       <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 flex justify-between items-center group-hover:bg-amber-50 transition-colors">
                         TMT Bar 12mm (Tata)
                         <ChevronDown className="w-4 h-4" />
                       </div>
                     </div>
                   </div>
                 </div>
              </div>
            </div>
          </div>

          {/* Validation & Footer Actions */}
          <div className="flex flex-col md:flex-row items-center gap-4">
             <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-3xl p-5 flex items-center gap-4">
               <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                 <CheckCircle2 className="w-6 h-6" />
               </div>
               <div className="flex flex-col">
                 <h4 className="text-sm font-black text-emerald-800 tracking-tight">Total Validation Passed</h4>
                 <p className="text-xs text-emerald-600 font-medium tracking-tight">Extracted total (₹54,870) matches calculated items total.</p>
               </div>
               <div className="ml-auto text-right">
                 <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block">Invoice Total</span>
                 <span className="text-lg font-black text-gray-900">₹54,870.00</span>
               </div>
             </div>
             
<div className="flex items-center gap-3 w-full md:w-auto">
                <button 
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white border border-gray-200 px-6 py-4 rounded-3xl font-bold text-sm text-gray-600 hover:bg-gray-50 transition-all active:scale-95 disabled:opacity-50"
                  onClick={() => handleSave(true)}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Draft
                </button>
                <button 
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-primary text-white px-10 py-4 rounded-3xl font-black text-sm shadow-xl shadow-primary/30 hover:scale-105 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
                  onClick={() => handleSave(false)}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                  Approve & Update Ledger
                </button>
              </div>
          </div>
        </div>
      </div>
    </div>
  )
}
