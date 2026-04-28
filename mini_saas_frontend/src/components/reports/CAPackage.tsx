'use client'

import React from 'react'
import { 
  FileText, 
  Download, 
  Printer, 
  Send, 
  CheckCircle2, 
  ShieldCheck, 
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Package as PackageIcon,
  Users
} from 'lucide-react'

interface CAPackageProps {
  onClose: () => void
}

export function CAPackage({ onClose }: CAPackageProps) {
  const formatCurrency = (val: number) => `₹${val.toLocaleString('en-IN')}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md" onClick={onClose} />

      {/* Package Content */}
      <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in fade-in duration-300">
        
        {/* Header */}
        <div className="bg-slate-900 px-10 py-8 text-white flex justify-between items-center">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black tracking-tight">CA Compliance Package</h2>
            </div>
            <p className="text-slate-400 text-sm font-medium">Period: April 2026 · <span className="text-emerald-400 font-black italic underline underline-offset-4">GST Ready</span></p>
          </div>
          <div className="flex items-center gap-3">
             <button className="p-3 hover:bg-slate-800 rounded-2xl transition-colors text-slate-400">
                <Printer className="w-5 h-5" />
             </button>
             <button onClick={onClose} className="p-3 hover:bg-slate-800 rounded-2xl transition-colors text-slate-400 font-black">
                ESC
             </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-10 space-y-10">
          
          {/* Executive Summary Section */}
          <section>
            <div className="flex items-center gap-2 mb-6">
               <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1 rounded-lg uppercase tracking-[0.2em]">01. Executive Summary</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">Total Taxable Sales</p>
                  <p className="text-3xl font-black text-slate-900 tracking-tighter">₹8,42,300</p>
               </div>
               <div className="p-6 bg-rose-50 border border-rose-100 rounded-3xl">
                  <p className="text-rose-400 text-[10px] font-black uppercase tracking-widest mb-2">Output GST Liability</p>
                  <p className="text-3xl font-black text-rose-600 tracking-tighter">₹74,520</p>
               </div>
               <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-3xl">
                  <p className="text-emerald-400 text-[10px] font-black uppercase tracking-widest mb-2">Input Tax Credit (ITC)</p>
                  <p className="text-3xl font-black text-emerald-600 tracking-tighter">₹18,420</p>
               </div>
            </div>
            <div className="mt-6 flex items-center gap-2 px-4">
               <CheckCircle2 className="w-4 h-4 text-emerald-500" />
               <span className="text-xs font-bold text-slate-500">All 142 invoices and 64 purchases for April 2026 have been fully reconciled and cryptographically verified.</span>
            </div>
          </section>

          {/* Reports & Ledgers */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
             {/* Sales & Tax Column */}
             <div className="space-y-6">
                <div className="flex items-center gap-2 mb-2">
                   <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1 rounded-lg uppercase tracking-[0.2em]">02. Sales & Tax Reports</span>
                </div>
                
                {[
                  { title: 'GSTR-1 JSON (Export)', desc: 'Monthly sales summary for portal upload.', meta: 'Day/Week breakdown included' },
                  { title: 'HSN-wise Summary', desc: 'Tax report with full HSN/SAC breakdown.', meta: '4 Tax Slabs identified' },
                ].map((item, i) => (
                  <div key={i} className="group p-5 bg-white border border-slate-100 rounded-[2rem] hover:shadow-xl hover:shadow-slate-100 transition-all cursor-pointer flex items-center justify-between">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                           <FileText className="w-6 h-6" />
                        </div>
                        <div>
                           <p className="font-black text-slate-900 tracking-tight">{item.title}</p>
                           <p className="text-xs text-slate-400 font-medium">{item.desc}</p>
                           <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mt-1">{item.meta}</p>
                        </div>
                     </div>
                     <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-indigo-500 transition-transform group-hover:translate-x-1" />
                  </div>
                ))}
             </div>

             {/* Ledger & Inventory Column */}
             <div className="space-y-6">
                <div className="flex items-center gap-2 mb-2">
                   <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1 rounded-lg uppercase tracking-[0.2em]">03. Ledger & Inventory</span>
                </div>

                {[
                  { title: 'Comprehensive Party Ledger', desc: 'Detailed receivables and payables history.', meta: '12 Active Parties' },
                  { title: 'Stock Movement Report', desc: 'Movement and valuation (FIFO method).', meta: '210 SKUs verified' },
                ].map((item, i) => (
                  <div key={i} className="group p-5 bg-white border border-slate-100 rounded-[2rem] hover:shadow-xl hover:shadow-slate-100 transition-all cursor-pointer flex items-center justify-between">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                           {item.title.includes('Party') ? <Users className="w-6 h-6" /> : <PackageIcon className="w-6 h-6" />}
                        </div>
                        <div>
                           <p className="font-black text-slate-900 tracking-tight">{item.title}</p>
                           <p className="text-xs text-slate-400 font-medium">{item.desc}</p>
                           <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mt-1">{item.meta}</p>
                        </div>
                     </div>
                     <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-indigo-500 transition-transform group-hover:translate-x-1" />
                  </div>
                ))}
             </div>
          </section>

          {/* Action Area */}
          <div className="bg-indigo-600 rounded-[2.5rem] p-10 text-white flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden shadow-2xl shadow-indigo-200">
             <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-32 -mt-32" />
             <div className="relative z-10 max-w-md">
                <h3 className="text-2xl font-black tracking-tight mb-2">Ready to Send?</h3>
                <p className="text-indigo-100 text-sm font-medium">
                  We will package these 4 reports into a secure, encrypted ZIP file and email it directly to your Chartered Accountant with a summary cover letter.
                </p>
             </div>
             <button className="relative z-10 bg-white text-indigo-600 px-10 py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-4">
                <Send className="w-5 h-5" />
                Dispatch to CA
             </button>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-10 py-6 border-t border-slate-100 text-center">
           <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">
             System Verified Compliance Package · Document ID: BZ-APR26-CA-PK-01
           </p>
        </div>
      </div>
    </div>
  )
}
