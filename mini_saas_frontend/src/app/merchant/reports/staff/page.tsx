'use client'

import { useState } from 'react'
import { 
  Users, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  BarChart, 
  ChevronLeft, 
  ArrowUpRight, 
  ArrowDownRight,
  User,
  ShieldCheck,
  Star,
  FileText
} from 'lucide-react'
import { 
  BarChart as ReBarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts'

const STAFF_PERFORMANCE = [
  { name: 'Ravi Kumar', sales: 142000, invoices: 45, accuracy: 99.8, color: '#6366f1' },
  { name: 'Sunil Sharma', sales: 85400, invoices: 32, accuracy: 98.2, color: '#10b981' },
  { name: 'Meera Gupta', sales: 12400, invoices: 12, accuracy: 100, color: '#f59e0b' },
  { name: 'Rahul V.', sales: 45000, invoices: 22, accuracy: 96.5, color: '#94a3b8' },
]

export default function StaffAnalyticsPage() {
  const formatCurrency = (val: number) => `₹${val.toLocaleString('en-IN')}`

  return (
    <div className="space-y-8 pb-20 animate-in">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
           <button className="p-3 bg-white border border-slate-100 rounded-2xl hover:bg-slate-50 transition-all">
              <ChevronLeft className="w-5 h-5 text-slate-400" />
           </button>
           <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Staff Performance</h1>
              <p className="text-slate-500 text-sm font-medium italic">Efficiency and sales metrics per user.</p>
           </div>
        </div>
        <div className="flex items-center gap-3 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
           <button className="px-4 py-2 rounded-xl text-xs font-black text-slate-900 bg-slate-100">Today</button>
           <button className="px-4 py-2 rounded-xl text-xs font-black text-slate-400 hover:bg-slate-50 transition-colors">This Week</button>
        </div>
      </div>

      {/* High Level Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         {[
           { label: 'Avg Sale Time', val: '4m 12s', icon: Clock, color: 'indigo' },
           { label: 'System Accuracy', val: '99.4%', icon: ShieldCheck, color: 'emerald' },
           { label: 'Voided Bills', val: '3', icon: XCircle, color: 'rose' },
           { label: 'Top Performer', val: 'Ravi K.', icon: Star, color: 'amber' },
         ].map((stat, i) => (
           <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className={`p-3 rounded-2xl bg-${stat.color}-50 text-${stat.color}-600`}>
                 <stat.icon className="w-5 h-5" />
              </div>
              <div>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                 <h3 className="text-xl font-black text-slate-900 tracking-tight">{stat.val}</h3>
              </div>
           </div>
         ))}
      </div>

      {/* Visual Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
         {/* Sales Bar Chart */}
         <div className="lg:col-span-8 bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-10">
               <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Sales Contribution</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Revenue generated per staff member</p>
               </div>
            </div>
            
            <div className="h-[350px] w-full">
               <ResponsiveContainer width="100%" height="100%">
                  <ReBarChart data={STAFF_PERFORMANCE} layout="vertical" barSize={32}>
                     <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                     <XAxis type="number" axisLine={false} tickLine={false} hide />
                     <YAxis 
                        dataKey="name" 
                        type="category" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#475569', fontSize: 12, fontWeight: 900 }}
                        width={100}
                     />
                     <Tooltip 
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                        formatter={(val: number) => formatCurrency(val)}
                     />
                     <Bar dataKey="sales" radius={[0, 8, 8, 0]}>
                        {STAFF_PERFORMANCE.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                     </Bar>
                  </ReBarChart>
               </ResponsiveContainer>
            </div>
         </div>

         {/* Efficiency Leaderboard */}
         <div className="lg:col-span-4 bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col">
            <h3 className="text-lg font-black text-slate-900 tracking-tight mb-1">Efficiency Metrics</h3>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-10">Accuracy and speed ranking</p>
            
            <div className="space-y-8 flex-1">
               {STAFF_PERFORMANCE.sort((a, b) => b.accuracy - a.accuracy).map((user, i) => (
                  <div key={i} className="flex items-center justify-between group">
                     <div className="flex items-center gap-4">
                        <div className="relative">
                           <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-black group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                              {user.name[0]}
                           </div>
                           {i === 0 && (
                              <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-400 rounded-full border-4 border-white flex items-center justify-center">
                                 <Star className="w-3 h-3 text-white fill-white" />
                              </div>
                           )}
                        </div>
                        <div>
                           <p className="text-sm font-black text-slate-900">{user.name}</p>
                           <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{user.invoices} Invoices</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-sm font-black text-indigo-600">{user.accuracy}%</p>
                        <p className="text-[10px] text-slate-300 font-black uppercase">Accuracy</p>
                     </div>
                  </div>
               ))}
            </div>

            <button className="mt-10 w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-200 hover:scale-[1.02] active:scale-95 transition-all">
               View Full Logs
            </button>
         </div>
      </div>

      {/* Security & Audit Section */}
      <div className="bg-indigo-600 rounded-[2.5rem] p-10 text-white flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
         <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -ml-32 -mb-32" />
         <div className="relative z-10 max-w-xl">
            <div className="flex items-center gap-3 mb-4">
               <ShieldCheck className="w-6 h-6 text-indigo-200" />
               <h3 className="text-2xl font-black tracking-tight">Integrity & Anti-Fraud Audit</h3>
            </div>
            <p className="text-indigo-100 text-sm font-medium leading-relaxed">
               All user actions are cryptographically signed and stored in the <span className="font-black text-white italic underline underline-offset-4 decoration-amber-400">Audit Ledger</span>. This prevents unauthorized invoice modifications or "shadow deletions" by staff members.
            </p>
         </div>
         <button className="relative z-10 bg-white text-indigo-600 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3">
            <FileText className="w-4 h-4" />
            Audit Ledger
         </button>
      </div>
    </div>
  )
}
