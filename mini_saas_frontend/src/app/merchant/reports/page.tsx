'use client'

import { 
  BarChart3, 
  Download, 
  Share2, 
  AlertTriangle, 
  Calendar, 
  ChevronDown, 
  ArrowUpRight, 
  ArrowDownRight,
  TrendingUp,
  Package,
  Users2,
  FileText,
  Send,
  ShieldCheck
} from 'lucide-react'
import { motion } from 'framer-motion'

export default function ReportsPage() {
  return (
    <div className="space-y-8 pb-10 animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Reports & GSTR</h1>
          <p className="text-gray-500 text-sm font-medium italic">Tax readiness and business performance insights.</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm">
           <button className="px-4 py-2 rounded-xl text-xs font-bold text-gray-900 bg-gray-100">This Month</button>
           <button className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:bg-gray-50 transition-colors">Last Month</button>
           <button className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:bg-gray-50 transition-colors flex items-center gap-2">
             Custom
             <ChevronDown className="w-3 h-3" />
           </button>
           <div className="w-[1px] h-6 bg-gray-100 mx-1" />
           <button className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-bold text-xs shadow-lg shadow-primary/20 hover:scale-105 transition-transform active:scale-95">
             <Share2 className="w-3.5 h-3.5" />
             Share with CA
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Tax Readiness */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white rounded-3xl border-l-8 border-l-amber-400 border border-gray-100 p-8 shadow-sm relative overflow-hidden group">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900 tracking-tight">GSTR-1 Readiness (Oct 2023)</h3>
                  <p className="text-xs text-gray-400 font-medium">Checked 42 invoices and 24 purchases for compliance.</p>
                </div>
              </div>
              <span className="text-3xl font-black text-amber-500 tracking-tighter italic">92%</span>
            </div>

            <div className="h-3 w-full bg-amber-50 rounded-full overflow-hidden mb-8">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: '92%' }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="h-full bg-amber-400 rounded-full" 
              />
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-center justify-between group-hover:bg-amber-100 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-amber-500 shadow-sm">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                   <h4 className="text-sm font-black text-amber-900 tracking-tight uppercase">Action Required</h4>
                   <p className="text-xs text-amber-700 font-medium tracking-tight">3 Invoices missing HSN codes. Tax may be incorrectly calculated.</p>
                </div>
              </div>
              <button className="bg-white border border-amber-200 px-4 py-2 rounded-xl text-[10px] font-black text-amber-700 uppercase tracking-widest hover:bg-amber-50 transition-colors shadow-sm">Fix Now</button>
            </div>
          </div>

          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">GSTR Core (Accountant View)</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black text-gray-900 tracking-tight">GSTR-1 Summary</h4>
                <Download className="w-4 h-4 text-gray-300 hover:text-gray-500 cursor-pointer" />
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 font-medium">B2B Sales (Taxable)</span>
                  <span className="font-bold text-gray-900">₹1,42,500.00</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-[-10px] pl-4">
                  <span>To 12 Parties</span>
                  <span>Tax: ₹25,650.00</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 font-medium">B2C Sales (Taxable)</span>
                  <span className="font-bold text-gray-900">₹45,200.00</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-[-10px] pl-4">
                  <span>Registered</span>
                  <span>Tax: ₹8,136.00</span>
                </div>
                <div className="pt-4 border-t border-gray-50 flex justify-between items-center">
                  <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Total Taxable Value</span>
                  <span className="text-lg font-black text-indigo-600">₹1,87,700.00</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-6">
               <div className="flex items-center justify-between">
                 <h4 className="text-sm font-black text-gray-900 tracking-tight">GSTR-3B (Est. Liability)</h4>
                 <Download className="w-4 h-4 text-gray-300 hover:text-gray-500 cursor-pointer" />
               </div>
               <div className="space-y-4">
                 <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex justify-between items-center">
                   <div className="flex flex-col">
                     <span className="text-[10px] text-rose-500 font-black uppercase tracking-widest">Output Tax</span>
                     <span className="text-xs text-rose-400 font-medium">(Collected)</span>
                   </div>
                   <span className="text-sm font-black text-rose-600">₹33,786.00</span>
                 </div>
                 <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex justify-between items-center">
                   <div className="flex flex-col">
                     <span className="text-[10px] text-emerald-500 font-black uppercase tracking-widest">Input Tax Credit</span>
                     <span className="text-xs text-emerald-400 font-medium">(ITC)</span>
                   </div>
                   <span className="text-sm font-black text-emerald-600">₹24,150.00</span>
                 </div>
                 <div className="pt-4 bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex justify-between items-center">
                   <span className="text-xs font-black text-indigo-500 uppercase tracking-widest">Net GST Payable</span>
                   <span className="text-xl font-black text-indigo-700">₹9,636.00</span>
                 </div>
               </div>
            </div>
          </div>
        </div>

        {/* Right Column: Deadlines & Insights */}
        <div className="lg:col-span-4 space-y-8">
          <div className="bg-[#0B0E14] rounded-3xl p-8 shadow-xl shadow-gray-900/10 text-white relative overflow-hidden group">
             <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform" />
             <div className="relative z-10">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 block">Next Filing Due</span>
                <h3 className="text-2xl font-black tracking-tight mb-1">11 November 2023</h3>
                <p className="text-xs text-gray-500 font-bold mb-8">GSTR-1 (October Period)</p>
                
                <div className="flex items-center gap-6 mb-8">
                  <div className="flex flex-col">
                    <span className="text-4xl font-black text-emerald-400 tracking-tighter">12</span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Days Left</span>
                  </div>
                  <div className="w-[1px] h-10 bg-gray-800" />
                  <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400">
                    <Calendar className="w-6 h-6" />
                  </div>
                </div>

                <button className="w-full flex items-center justify-center gap-3 bg-indigo-600 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 active:scale-95">
                  <Send className="w-4 h-4" />
                  Send to CA
                </button>
             </div>
          </div>

          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block">Business Insights</span>

          <div className="space-y-4">
             {[
               { label: 'Sales vs Purchase', icon: TrendingUp, val: '₹2,21,486.00', color: 'indigo' },
               { label: 'Inventory Health', icon: Package, val: '₹45,200.00', color: 'emerald', sub: 'Dead Stock Value' },
               { label: 'Outstanding Dues', icon: Users2, val: '₹1,12,400.00', color: 'rose', sub: 'To Receive (Market)' }
             ].map((insight, i) => (
               <div key={i} className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm flex items-center justify-between group cursor-pointer hover:shadow-md transition-all">
                 <div className="flex items-center gap-4">
                   <div className={`w-12 h-12 rounded-2xl bg-${insight.color}-50 text-${insight.color}-500 flex items-center justify-center transition-transform group-hover:scale-110`}>
                     <insight.icon className="w-6 h-6" />
                   </div>
                   <div className="flex flex-col">
                     <span className="text-xs font-bold text-gray-400 mb-1">{insight.label}</span>
                     <span className="text-lg font-black text-gray-900 tracking-tight">{insight.val}</span>
                     {insight.sub && <span className={`text-[10px] font-bold text-${insight.color}-500 uppercase tracking-widest mt-1`}>{insight.sub}</span>}
                   </div>
                 </div>
                 <ArrowUpRight className="w-5 h-5 text-gray-200 group-hover:text-primary transition-colors" />
               </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  )
}
