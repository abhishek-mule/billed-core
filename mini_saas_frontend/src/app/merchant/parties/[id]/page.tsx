'use client'

import { useParams } from 'next/navigation'
import { 
  Building2, 
  MapPin, 
  Phone, 
  Download, 
  Plus, 
  MessageCircle, 
  ArrowUpRight, 
  ArrowDownLeft,
  ChevronRight,
  MoreHorizontal,
  Calendar,
  Wallet,
  Activity
} from 'lucide-react'
import { motion } from 'framer-motion'

export default function PartyLedgerPage() {
  const params = useParams()
  
  const transactions = [
    { 
      type: 'RECEIVED', 
      id: 'RCPT-23-089', 
      date: 'Today, 11:42 AM', 
      amount: 12000, 
      balance: 45200, 
      note: 'UPI Payment via WhatsApp link',
      status: 'success'
    },
    { 
      type: 'BILLED', 
      id: 'INV-23-0144', 
      date: '12 Oct, 4:15 PM', 
      amount: 32400, 
      balance: 57200, 
      items: ['Cement', 'TMT Bars'],
      status: 'billed'
    },
    { 
      type: 'BILLED', 
      id: 'INV-23-0130', 
      date: '10 Oct, 10:30 AM', 
      amount: 24800, 
      balance: 24800, 
      items: ['Paints'],
      status: 'billed'
    }
  ]

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount)
  }

  return (
    <div className="space-y-6 pb-10 animate-in">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Party Ledger</h1>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2.5 rounded-xl font-bold text-sm text-gray-600 hover:bg-gray-50 transition-all">
            <Download className="w-4 h-4" />
            Export Statement
          </button>
          <button className="flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-transform active:scale-95">
            <Plus className="w-4 h-4" />
            New Party
          </button>
        </div>
      </div>

      {/* Party Info Card */}
      <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center shadow-inner">
            <Building2 className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Ramesh Hardware & Tools</h2>
              <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest border border-indigo-100">Customer</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 font-medium">
              <div className="flex items-center gap-1.5">
                <span className="bg-gray-100 px-2 py-0.5 rounded text-[10px] font-bold text-gray-600">GST: 27AABCR1234Q1Z5</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-400">
                <MapPin className="w-4 h-4" />
                <span>Mumbai, Maharashtra</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-emerald-50/50 border border-emerald-100 rounded-2xl px-5 py-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">WhatsApp Action</span>
            <span className="text-sm font-bold text-emerald-700">+91 98765 43210</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                <Calendar className="w-5 h-5 text-gray-400" />
                Transaction Timeline
              </h3>
              <span className="text-xs font-bold text-gray-400 italic">Tap any entry to view source document</span>
            </div>

            <div className="relative space-y-12 before:absolute before:left-[1.85rem] before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-50">
              {transactions.map((tx, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={tx.id} 
                  className="relative pl-16 group cursor-pointer"
                >
                  <div className={`absolute left-0 top-0 w-10 h-10 rounded-full flex items-center justify-center border-4 border-white shadow-md z-10 transition-transform group-hover:scale-110 ${
                    tx.type === 'RECEIVED' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                  }`}>
                    {tx.type === 'RECEIVED' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                  </div>

                  <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm group-hover:shadow-md transition-shadow">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                      <div className="flex flex-col gap-1">
                         <div className="flex items-center gap-2">
                           <span className={`px-2 py-0.5 rounded bg-gray-50 text-[10px] font-black uppercase tracking-widest ${
                             tx.type === 'RECEIVED' ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'
                           }`}>
                             {tx.type === 'RECEIVED' ? '(-)' : '(+)'} {tx.type}
                           </span>
                           <span className="text-sm font-bold text-gray-900">{tx.id}</span>
                         </div>
                         <span className="text-xs text-gray-400 font-medium">{tx.date}</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-xl font-black ${tx.type === 'RECEIVED' ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {tx.type === 'RECEIVED' ? '-' : '+'} {formatCurrency(tx.amount)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                      <div className="text-xs text-gray-500 font-medium">
                        {tx.note && <span>{tx.note}</span>}
                        {tx.items && <span>{tx.items.length} items ({tx.items.join(', ')})</span>}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest block">Balance</span>
                        <span className="text-sm font-bold text-gray-700">{formatCurrency(tx.balance)}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar Stats */}
        <div className="space-y-6">
          {/* Outstanding Card */}
          <div className="bg-white rounded-3xl border border-rose-100 p-8 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
            <div className="relative">
               <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-2 block text-center">Total Outstanding</span>
               <h2 className="text-4xl font-black text-gray-900 text-center tracking-tight mb-8">₹45,200.<span className="text-xl text-gray-400 font-bold">00</span></h2>
               
               <div className="space-y-4 mb-8">
                 <div className="flex justify-between items-end">
                   <div className="flex flex-col">
                     <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Credit Limit</span>
                     <span className="text-sm font-bold text-gray-700">₹1,00,000</span>
                   </div>
                   <span className="text-xs font-black text-rose-500">45% Used</span>
                 </div>
                 <div className="h-3 w-full bg-rose-50 rounded-full overflow-hidden">
                   <div className="h-full bg-rose-500 rounded-full" style={{ width: '45%' }} />
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-3">
                 <button className="flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl text-xs font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform active:scale-95">
                   <Wallet className="w-4 h-4" />
                   Record
                 </button>
                 <button className="flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-600 py-3 rounded-xl text-xs font-bold hover:bg-gray-50 transition-all active:scale-95">
                   <Phone className="w-4 h-4" />
                   Reminder
                 </button>
               </div>
            </div>
          </div>

          {/* Aging Analysis */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Aging Analysis
            </h3>
            <div className="space-y-4">
              {[
                { label: '0 - 30 Days', sub: 'Due yet', value: 12800, color: 'emerald' },
                { label: '31 - 60 Days', sub: 'Slightly overdue', value: 32400, color: 'amber' },
                { label: '60+ Days', sub: 'Critically overdue', value: 0, color: 'rose' }
              ].map((age, i) => (
                <div key={i} className={`p-4 rounded-2xl border flex items-center justify-between transition-all hover:translate-x-1 ${
                  age.color === 'emerald' ? 'bg-emerald-50 border-emerald-100' : 
                  age.color === 'amber' ? 'bg-amber-50 border-amber-100' : 'bg-rose-50 border-rose-100'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-1.5 h-10 rounded-full bg-${age.color}-500`} />
                    <div className="flex flex-col">
                      <span className={`text-sm font-bold text-${age.color}-700`}>{age.label}</span>
                      <span className={`text-[10px] text-${age.color}-500/70 font-medium`}>{age.sub}</span>
                    </div>
                  </div>
                  <span className={`text-sm font-black text-${age.color}-700`}>{formatCurrency(age.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
