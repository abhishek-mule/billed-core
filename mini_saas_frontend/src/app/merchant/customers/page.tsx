'use client'

import { useState } from 'react'
import { 
  Search, 
  Plus, 
  Users, 
  Phone, 
  ArrowUpRight, 
  ArrowDownRight, 
  ArrowRight,
  MessageSquare, 
  History, 
  Wallet, 
  MoreHorizontal, 
  Mail,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  Clock,
  ExternalLink
} from 'lucide-react'

// --- Types ---
interface Customer {
  id: string
  name: string
  phone: string
  email: string
  totalOrders: number
  totalSpent: number
  outstanding: number
  lastVisit: string
  status: 'Loyal' | 'Regular' | 'At Risk'
}

const mockCustomers: Customer[] = [
  { id: 'CUST-001', name: 'Anjali Sharma', phone: '9876543210', email: 'anjali@example.com', totalOrders: 24, totalSpent: 45200, outstanding: 0, lastVisit: '2 days ago', status: 'Loyal' },
  { id: 'CUST-002', name: 'Arjun Kumar', phone: '8888888888', email: 'arjun@example.com', totalOrders: 12, totalSpent: 32150, outstanding: 4500, lastVisit: '1 week ago', status: 'Regular' },
  { id: 'CUST-003', name: 'Meera Gupta', phone: '7777777777', email: 'meera@example.com', totalOrders: 45, totalSpent: 124000, outstanding: 12500, lastVisit: 'Today', status: 'Loyal' },
  { id: 'CUST-004', name: 'Rohan Mehta', phone: '9999999999', email: 'rohan@example.com', totalOrders: 2, totalSpent: 850, outstanding: 0, lastVisit: '1 month ago', status: 'At Risk' },
]

export default function CustomersPage() {
  const [search, setSearch] = useState('')

  const formatCurrency = (val: number) => `₹${val.toLocaleString('en-IN')}`

  return (
    <div className="space-y-8 pb-20 animate-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Customer Intelligence</h1>
          <p className="text-slate-500 text-sm font-medium italic">Manage customer relations, loyalty, and outstanding ledgers.</p>
        </div>
        <button className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-indigo-100 hover:scale-[1.02] transition-all active:scale-95">
          <Plus className="w-4 h-4" />
          Add New Customer
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
               <Users className="w-7 h-7" />
            </div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Customers</p>
               <h3 className="text-2xl font-black text-slate-900 tracking-tight">1,248</h3>
            </div>
         </div>
         <div className="bg-rose-50 p-6 rounded-[2rem] border border-rose-100 shadow-sm flex items-center justify-between group">
            <div className="flex items-center gap-5">
               <div className="w-14 h-14 rounded-2xl bg-white text-rose-500 shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Wallet className="w-7 h-7" />
               </div>
               <div>
                  <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Total Outstanding (Udhar)</p>
                  <h3 className="text-2xl font-black text-rose-600 tracking-tight">₹1.84 Lakh</h3>
               </div>
            </div>
            <ArrowRight className="w-5 h-5 text-rose-300" />
         </div>
         <div className="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white text-emerald-500 shadow-sm flex items-center justify-center">
               <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
               <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Active Loyalty</p>
               <h3 className="text-2xl font-black text-emerald-900 tracking-tight">842 <span className="text-xs text-emerald-500 font-bold ml-1">Members</span></h3>
            </div>
         </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
         <div className="flex-1 relative group w-full">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-300 group-focus-within:text-indigo-500 transition-colors" />
            <input 
               type="text" 
               placeholder="Search by name, phone number, or email..." 
               className="w-full bg-white border border-slate-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold focus:outline-none ring-4 ring-indigo-500/0 focus:ring-indigo-500/5 transition-all shadow-sm"
               value={search}
               onChange={(e) => setSearch(e.target.value)}
            />
         </div>
         <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-slate-100 shadow-sm w-full md:w-auto">
            <button className="px-6 py-2.5 rounded-xl text-xs font-black bg-slate-900 text-white shadow-md transition-all">All</button>
            <button className="px-6 py-2.5 rounded-xl text-xs font-black text-slate-400 hover:bg-slate-50 transition-all">Debtors</button>
            <button className="px-6 py-2.5 rounded-xl text-xs font-black text-slate-400 hover:bg-slate-50 transition-all">Loyalty</button>
         </div>
      </div>

      {/* Customer Table */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                     <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Profile</th>
                     <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Orders / Spend</th>
                     <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Outstanding</th>
                     <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                     <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-16"></th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {mockCustomers.map((cust) => (
                     <tr key={cust.id} className="group hover:bg-slate-50/50 transition-all cursor-pointer">
                        <td className="px-8 py-6">
                           <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-black text-lg group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                                 {cust.name[0]}
                              </div>
                              <div>
                                 <p className="font-black text-slate-900 tracking-tight group-hover:text-indigo-600 transition-colors">{cust.name}</p>
                                 <p className="text-xs text-slate-400 font-bold flex items-center gap-1">
                                    <Phone className="w-3 h-3" /> {cust.phone}
                                 </p>
                              </div>
                           </div>
                        </td>
                        <td className="px-8 py-6">
                           <p className="text-sm font-black text-slate-900">{formatCurrency(cust.totalSpent)}</p>
                           <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{cust.totalOrders} Orders · {cust.lastVisit}</p>
                        </td>
                        <td className="px-8 py-6 text-center">
                           {cust.outstanding > 0 ? (
                              <div>
                                 <p className="text-sm font-black text-rose-600">{formatCurrency(cust.outstanding)}</p>
                                 <button className="text-[10px] font-black text-indigo-500 uppercase tracking-widest hover:underline mt-1">Send Reminder</button>
                              </div>
                           ) : (
                              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded-md">Fully Paid</span>
                           )}
                        </td>
                        <td className="px-8 py-6">
                           <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg border ${
                              cust.status === 'Loyal' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                              cust.status === 'Regular' ? 'bg-slate-50 text-slate-600 border-slate-100' :
                              'bg-rose-50 text-rose-600 border-rose-100'
                           }`}>
                              {cust.status}
                           </span>
                        </td>
                        <td className="px-8 py-6 text-right">
                           <button className="p-2 text-slate-300 hover:text-slate-600 transition-colors">
                              <MoreHorizontal className="w-5 h-5" />
                           </button>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
         
         {/* Pagination */}
         <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 italic">Showing 4 of 1,248 customers</span>
            <div className="flex items-center gap-2">
               <button className="p-2 border border-slate-200 rounded-xl text-slate-400 hover:bg-white transition-all"><ChevronLeft className="w-4 h-4" /></button>
               <button className="w-10 h-10 rounded-xl bg-slate-900 text-white text-xs font-black shadow-lg shadow-slate-200">1</button>
               <button className="p-2 border border-slate-200 rounded-xl text-slate-400 hover:bg-white transition-all"><ChevronRight className="w-4 h-4" /></button>
            </div>
         </div>
      </div>

      {/* Advanced CRM Features */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         {/* Marketing Campaign Card */}
         <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden group shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-32 -mt-32 transition-transform group-hover:scale-110" />
            <div className="relative z-10 flex flex-col h-full justify-between">
               <div>
                  <div className="flex items-center gap-3 mb-6">
                     <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg">
                        <MessageSquare className="w-6 h-6" />
                     </div>
                     <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">WhatsApp Broadcast</span>
                  </div>
                  <h3 className="text-2xl font-black tracking-tight mb-4">Re-engage 124 "At Risk" Customers</h3>
                  <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-sm">
                     Automatically send a "We miss you" discount coupon to customers who haven't visited in over 30 days.
                  </p>
               </div>
               <button className="mt-10 bg-white text-slate-900 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:scale-[1.02] transition-all active:scale-95">
                  Launch Campaign
               </button>
            </div>
         </div>

         {/* Debt Recovery Intelligence */}
         <div className="bg-rose-600 rounded-[2.5rem] p-10 text-white relative overflow-hidden group shadow-2xl shadow-rose-200">
            <div className="absolute bottom-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-3xl -mr-24 -mb-24" />
            <div className="relative z-10 flex flex-col h-full justify-between">
               <div>
                  <div className="flex items-center gap-3 mb-6">
                     <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-rose-600">
                        <Clock className="w-6 h-6" />
                     </div>
                     <span className="text-[10px] font-black text-rose-200 uppercase tracking-[0.2em]">Automatic Recovery</span>
                  </div>
                  <h3 className="text-2xl font-black tracking-tight mb-4">₹12,500 High-Value Outstanding</h3>
                  <p className="text-rose-100 text-sm font-medium leading-relaxed max-w-sm">
                     <span className="font-black">Meera Gupta</span> has exceeded her credit limit. Next invoice will be locked until recovery.
                  </p>
               </div>
               <div className="mt-10 flex items-center gap-3">
                  <button className="flex-1 bg-white text-rose-600 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:scale-105 transition-all">
                     View Ledger
                  </button>
                  <button className="p-4 bg-rose-500 rounded-2xl hover:bg-rose-400 transition-colors">
                     <ExternalLink className="w-5 h-5" />
                  </button>
               </div>
            </div>
         </div>
      </div>

    </div>
  )
}