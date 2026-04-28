'use client'

import { useState } from 'react'
import { 
  Scan, 
  Upload, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  ChevronDown, 
  Search, 
  FileText, 
  Maximize2, 
  Eye, 
  ExternalLink,
  Zap,
  ArrowRight,
  Printer,
  ChevronRight,
  Bell
} from 'lucide-react'

export default function MagicScanReviewPage() {
  const [isReviewMode, setIsReviewMode] = useState(true)

  if (!isReviewMode) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-6 animate-in">
         <div className="w-20 h-20 rounded-[2rem] bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-xl shadow-indigo-100">
            <Scan className="w-10 h-10" />
         </div>
         <div className="text-center space-y-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Magic Scan Purchase</h2>
            <p className="text-slate-400 text-sm font-medium">Upload or scan a supplier invoice to auto-extract data.</p>
         </div>
         <button 
          onClick={() => setIsReviewMode(true)}
          className="bg-slate-900 text-white px-10 py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-4"
         >
            <Upload className="w-5 h-5" />
            Upload Supplier Invoice
         </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20 animate-in">
      
      {/* Top Banner (Demo Mode) */}
      <div className="bg-amber-500 py-3 px-8 -mx-8 -mt-8 mb-8 flex items-center justify-center gap-3">
         <AlertCircle className="w-4 h-4 text-white" />
         <span className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Demo Mode — Data not saved to real accounting system</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Review Scanned Purchase</h1>
          <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
             <Zap className="w-3.5 h-3.5" />
             AI Extracted
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-white border border-slate-200 px-6 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
            <Upload className="w-4 h-4" />
            Upload Another
          </button>
          <button onClick={() => setIsReviewMode(false)} className="p-2.5 text-slate-300 hover:text-slate-900 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left: Document Preview */}
        <div className="lg:col-span-5 space-y-4">
           <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <FileText className="w-4 h-4 text-slate-300" />
                 <span className="text-xs font-bold text-slate-400 italic">invoice_october_supplier.pdf</span>
              </div>
              <div className="flex items-center gap-2">
                 <button className="p-2 text-slate-300 hover:text-slate-600"><Search className="w-4 h-4" /></button>
                 <button className="p-2 text-slate-300 hover:text-slate-600"><Maximize2 className="w-4 h-4" /></button>
              </div>
           </div>
           
           <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden p-10 min-h-[500px] relative">
              {/* Simulated Invoice Content */}
              <div className="max-w-md mx-auto space-y-12 animate-pulse">
                 <div className="flex justify-between items-start">
                    <div className="space-y-2">
                       <h3 className="text-2xl font-black text-slate-900 tracking-tighter">BALAJI TRADERS</h3>
                       <div className="bg-emerald-50 px-3 py-1 rounded-md text-[10px] font-black text-emerald-600">GSTIN: 27AABCU9603R1ZM</div>
                       <div className="text-[10px] font-bold text-slate-400">Invoice No: BT/23-24/0892</div>
                    </div>
                    <div className="text-right text-[10px] font-bold text-slate-300 uppercase tracking-widest">Invoice #BT/23-24/0892</div>
                 </div>

                 <div className="space-y-6 pt-10">
                    <div className="flex justify-between border-b border-slate-50 pb-2">
                       <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Description</span>
                       <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Total</span>
                    </div>
                    <div className="flex justify-between">
                       <span className="font-bold text-slate-900">Super Cement 50kg</span>
                       <span className="font-black text-slate-900">₹14,500.00</span>
                    </div>
                    <div className="flex justify-between">
                       <span className="font-bold text-slate-900">Steel TMT 12mm</span>
                       <span className="font-black text-slate-900">₹32,000.00</span>
                    </div>
                 </div>

                 <div className="pt-10 flex flex-col items-end gap-2">
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Grand Total</span>
                    <span className="text-3xl font-black text-slate-900 tracking-tighter">₹46,500.00</span>
                 </div>
              </div>
              
              {/* OCR Scan Line */}
              <div className="absolute inset-x-0 top-0 h-1 bg-indigo-500/20 shadow-[0_0_15px_rgba(79,70,229,0.5)] animate-scan pointer-events-none" />
           </div>
        </div>

        {/* Right: Extracted Data & Mapping */}
        <div className="lg:col-span-7 space-y-8">
           
           {/* Supplier Details Card */}
           <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-sm space-y-8">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Supplier Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase">Supplier GSTIN</label>
                       <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">High Match</span>
                    </div>
                    <div className="relative">
                       <input type="text" defaultValue="27AABCU9603R1ZM" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:outline-none ring-4 ring-indigo-500/0 focus:ring-indigo-500/5 transition-all" />
                       <CheckCircle2 className="absolute right-5 top-4 w-5 h-5 text-emerald-500" />
                    </div>
                 </div>
                 <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase">Supplier Name (Auto-fetched)</label>
                       <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">High Match</span>
                    </div>
                    <div className="relative">
                       <input type="text" defaultValue="Balaji Traders" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:outline-none ring-4 ring-indigo-500/0 focus:ring-indigo-500/5 transition-all" />
                       <CheckCircle2 className="absolute right-5 top-4 w-5 h-5 text-emerald-500" />
                    </div>
                 </div>
                 <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase">Invoice Number</label>
                       <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">High Match</span>
                    </div>
                    <div className="relative">
                       <input type="text" defaultValue="BT/23-24/0892" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:outline-none ring-4 ring-indigo-500/0 focus:ring-indigo-500/5 transition-all" />
                       <CheckCircle2 className="absolute right-5 top-4 w-5 h-5 text-emerald-500" />
                    </div>
                 </div>
                 <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase">Invoice Date</label>
                       <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Review</span>
                    </div>
                    <div className="relative">
                       <input type="text" defaultValue="18 Oct 2023" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:outline-none ring-4 ring-indigo-500/0 focus:ring-indigo-500/5 transition-all" />
                       <FileText className="absolute right-5 top-4 w-5 h-5 text-amber-500" />
                    </div>
                 </div>
              </div>
           </div>

           {/* Line Items & Stock Mapping */}
           <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-sm space-y-8">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Line Items & Stock Mapping</h3>
                 <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">2 Items Extracted</span>
              </div>

              <div className="space-y-12">
                 {/* Item 1 */}
                 <div className="relative pl-6 border-l-4 border-emerald-400 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                       <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Scanned Item Name</label>
                          <input type="text" defaultValue="Super Cement 50kg" className="w-full bg-slate-50/50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-500" readOnly />
                       </div>
                       <div className="space-y-2">
                          <div className="flex justify-between items-center">
                             <label className="text-[9px] font-black text-slate-900 uppercase tracking-widest">Map to BillZo</label>
                             <span className="text-[9px] font-black text-emerald-500 uppercase">Auto-matched</span>
                          </div>
                          <div className="relative">
                             <select className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-4 py-3 text-sm font-black text-emerald-700 appearance-none focus:outline-none">
                                <option>Ultratech Cement 50kg</option>
                             </select>
                             <ChevronDown className="absolute right-4 top-3 w-4 h-4 text-emerald-400" />
                          </div>
                       </div>
                    </div>
                    <div className="grid grid-cols-3 gap-8">
                       <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-300 uppercase">Qty</label>
                          <p className="text-lg font-black text-slate-900">50</p>
                       </div>
                       <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-300 uppercase">Rate (₹)</label>
                          <p className="text-lg font-black text-slate-900">290.00</p>
                       </div>
                       <div className="space-y-1 text-right">
                          <label className="text-[9px] font-black text-slate-300 uppercase">Amount</label>
                          <p className="text-lg font-black text-slate-900">14,500.00</p>
                       </div>
                    </div>
                 </div>

                 {/* Item 2 */}
                 <div className="relative pl-6 border-l-4 border-amber-400 space-y-6 opacity-80">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                       <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Scanned Item Name</label>
                          <input type="text" defaultValue="Steel TMT 12mm" className="w-full bg-slate-50/50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-500" readOnly />
                       </div>
                       <div className="space-y-2">
                          <div className="flex justify-between items-center">
                             <label className="text-[9px] font-black text-slate-900 uppercase tracking-widest">Map to BillZo</label>
                             <span className="text-[9px] font-black text-amber-500 uppercase">Review Mapped</span>
                          </div>
                          <div className="relative">
                             <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-900 appearance-none focus:outline-none">
                                <option>TMT Bar 12mm (Tata)</option>
                             </select>
                             <ChevronDown className="absolute right-4 top-3 w-4 h-4 text-slate-400" />
                          </div>
                       </div>
                    </div>
                    <div className="grid grid-cols-3 gap-8">
                       <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-300 uppercase">Qty</label>
                          <p className="text-lg font-black text-slate-900">20</p>
                       </div>
                       <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-300 uppercase">Rate (₹)</label>
                          <p className="text-lg font-black text-slate-900">1600.00</p>
                       </div>
                       <div className="space-y-1 text-right">
                          <label className="text-[9px] font-black text-slate-300 uppercase">Amount</label>
                          <p className="text-lg font-black text-slate-900">32,000.00</p>
                       </div>
                    </div>
                 </div>
              </div>
              
              <div className="pt-10 border-t border-slate-50 flex items-center justify-between">
                 <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                       <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                       <p className="text-sm font-black text-slate-900 tracking-tight">Everything looks correct?</p>
                       <p className="text-xs text-slate-400 font-medium">This will inward 70 units into your inventory.</p>
                    </div>
                 </div>
                 <button className="bg-indigo-600 text-white px-10 py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl shadow-indigo-100 hover:scale-105 active:scale-95 transition-all flex items-center gap-4">
                    Approve & Inward Stock
                    <ArrowRight className="w-5 h-5" />
                 </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  )
}
