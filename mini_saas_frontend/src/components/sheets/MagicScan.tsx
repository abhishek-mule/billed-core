'use client'

import { useState } from 'react'
import { Button } from '../sheets/Base'
import { Sparkles, CheckCircle2 } from 'lucide-react'

export function MagicScanVerify({ onClose }: { onClose: () => void }) {
  const [extractedData, setExtractedData] = useState({
    supplier: 'R.K. Electronics & Distributors',
    invoiceNo: 'INV-2023-89',
    date: '24 Oct 2023',
    items: [
      { name: 'Samsung 25W PD Adapter', qty: 10, rate: 450, total: 4500, hsn: '8544?', gst: '18%' },
      { name: 'Type-C to Type-C Cable', qty: 20, rate: 60, total: 1200, hsn: '8544?', needsReview: true },
    ],
    total: 6726,
  })

  const formatCurrency = (n: number) => '₹' + n.toLocaleString('en-IN')

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Camera view - Matching Screenshot 5 */}
      <div className="flex-0 h-[45%] relative bg-black flex flex-col">
        <div className="text-center py-6 text-white bg-gradient-to-b from-black to-transparent">
          <div className="font-bold text-lg tracking-tight">Verify Purchase Bill</div>
          <div className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">1/1 Images Scanned</div>
        </div>
        <div className="flex-1 overflow-hidden flex items-center justify-center relative">
          {/* Real-ish looking receipt image mock */}
          <div className="bg-[#FAF9F6] p-6 rounded shadow-2xl w-[85%] font-serif text-[10px] transform -rotate-1 shadow-black/50">
            <div className="text-center font-black text-sm mb-2 text-slate-800 tracking-tighter">GROCERY EMPORIUM</div>
            <div className="text-[8px] text-slate-500 text-center mb-4 font-sans">123 MARKET ST, ANYTOWN, CA 91234 — 03/15/2024</div>
            <div className="space-y-1.5 opacity-80">
              <div className="flex justify-between"><span>ORGANIC APPLES</span><span>4.50</span></div>
              <div className="flex justify-between bg-yellow-400/30 rounded px-1 -mx-1 ring-1 ring-yellow-400/50"><span>FRESH AVOCADOS</span><span>3.00</span></div>
              <div className="flex justify-between bg-yellow-400/30 rounded px-1 -mx-1 ring-1 ring-yellow-400/50"><span>ARTISNAL BRECTIOD</span><span>5.99</span></div>
              <div className="flex justify-between"><span>MILK (WHOLE)</span><span>8.75</span></div>
              <div className="flex justify-between border-t border-dashed border-slate-300 pt-1 mt-2">
                <span className="font-black">SUBTOTAL</span><span className="font-black">9.94</span>
              </div>
            </div>
          </div>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-800/80 backdrop-blur-md text-white px-6 py-2.5 rounded-full text-[10px] font-bold whitespace-nowrap shadow-xl">
            Tap any field to zoom photo
          </div>
        </div>
      </div>

      {/* Extracted data - Matching Screenshot 5 */}
      <div className="flex-1 overflow-y-auto bg-white rounded-t-[2.5rem] -mt-8 px-6 pt-2 pb-8 shadow-2xl">
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 mt-2" />
        
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center border border-blue-100">
              <Sparkles className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="font-black text-[#1A1C1E] text-sm">Extracted by Magic Scan</div>
            </div>
          </div>
          <div className="bg-blue-50 rounded-full px-4 py-1.5 border border-blue-100 flex items-center gap-1.5">
             <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
            <span className="text-blue-700 font-black text-[10px] uppercase tracking-wider">98% Accuracy</span>
          </div>
        </div>

        <div className="text-[10px] font-bold tracking-[0.2em] text-slate-400 mb-3 uppercase">SUPPLIER DETAILS</div>
        <div className="border border-slate-100 bg-slate-50/50 rounded-3xl p-5 mb-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
             <CheckCircle2 className="w-12 h-12 text-blue-600" />
          </div>
          <div className="relative z-10">
            <div className="text-[10px] font-bold text-slate-400 mb-1">SUPPLIER NAME</div>
            <div className="font-black text-[#1A1C1E] text-lg leading-tight mb-4">{extractedData.supplier}</div>
            <div className="flex gap-6">
              <div className="flex-1">
                <div className="text-[10px] font-bold text-slate-400 mb-1">INVOICE NO.</div>
                <div className="font-black text-[#1A1C1E]">{extractedData.invoiceNo}</div>
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-bold text-slate-400 mb-1">DATE</div>
                <div className="font-black text-[#1A1C1E]">{extractedData.date}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-3 px-1">
          <span className="text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase">LINE ITEMS (2)</span>
          <button className="text-[11px] font-black text-blue-600 uppercase tracking-widest">EDIT</button>
        </div>

        <div className="space-y-3 mb-8">
          {extractedData.items.map((item, i) => (
            <div 
              key={i} 
              className={`p-5 rounded-3xl border transition-all relative overflow-hidden ${
                item.needsReview ? 'bg-amber-50 border-amber-100' : 'bg-white border-slate-100'
              }`}
            >
              {item.needsReview && (
                <div className="absolute top-0 right-0 bg-amber-400 text-black px-4 py-1.5 rounded-bl-2xl text-[9px] font-black uppercase tracking-widest shadow-sm">
                  Review
                </div>
              )}
              <div className="flex justify-between mb-4">
                <span className="font-black text-[#1A1C1E] text-base">{item.name}</span>
                <span className="font-black text-[#1A1C1E]">{formatCurrency(item.total)}</span>
              </div>
              <div className="flex gap-3">
                <div className="flex-1 bg-white border border-slate-100 rounded-2xl p-3 shadow-sm">
                  <div className="text-slate-400 font-bold text-[9px] uppercase tracking-widest mb-1">HSN</div>
                  <div className="font-black text-sm">{item.hsn}</div>
                </div>
                <div className="flex-1 bg-white border border-slate-100 rounded-2xl p-3 shadow-sm">
                  <div className="text-slate-400 font-bold text-[9px] uppercase tracking-widest mb-1">QTY × RATE</div>
                  <div className="font-black text-sm">{item.qty} × ₹{item.rate}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-end mb-8 px-1">
          <div>
            <div className="text-sm font-bold text-slate-400">Total Amount</div>
            <div className="text-emerald-500 font-black text-xs flex items-center gap-1 mt-1">
               <CheckCircle2 className="w-3.5 h-3.5" />
               Matches Bill Total
            </div>
          </div>
          <span className="font-black text-4xl text-[#1A1C1E] tracking-tight">{formatCurrency(extractedData.total)}</span>
        </div>

        <button 
          onClick={onClose}
          className="w-full py-5 rounded-3xl bg-blue-600 text-white font-black text-lg shadow-xl shadow-blue-600/20 active:scale-[0.98] transition-all"
        >
          Save to Purchases
        </button>
      </div>
    </div>
  )
}